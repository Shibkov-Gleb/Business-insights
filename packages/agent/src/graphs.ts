import { Annotation, StateGraph, START, END } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { z } from "zod";
import { db, json } from "@context/db";
import { config } from "@context/config";
import {
  assessmentSchema,
  type Assessment,
  type EvidenceRef,
} from "@context/contracts";
import {
  BraveSearch,
  canonicalUrl,
  digest,
  extractPage,
  readRss,
  type RetrievedSource,
} from "./sources.ts";
import { liveLLM, newBudget, type Budget } from "./providers.ts";
import { demoSources, demoAssessment } from "./demo.ts";
import { event } from "../../db/src/jobs.ts";
import { publicTopics } from "./planning.ts";
import { captureSource } from "./snapshots.ts";
export const checkpointer = PostgresSaver.fromConnString(config.DATABASE_URL);
export type Candidate = {
  key: string;
  fingerprint: string;
  assessment: Assessment;
  evidence: EvidenceRef[];
  severity: string;
  potentialSeverity: string | null;
};
type SearchStep = { query: string; from: string; to: string };
export function severity(a: Assessment) {
  if (a.relevance < 3) return "low";
  if (
    a.relevance >= 4 &&
    a.impact >= 4 &&
    a.urgency >= 4 &&
    a.dependencyConfirmed &&
    a.confidence !== "low"
  )
    return "critical";
  if (a.impact >= 4 || (a.impact >= 3 && a.urgency >= 3)) return "high";
  return "medium";
}
export function windows(from: Date, to: Date) {
  const result: { from: string; to: string }[] = [];
  for (let start = from.getTime(); start < to.getTime(); start += 30 * 86400000)
    result.push({
      from: new Date(start).toISOString(),
      to: new Date(Math.min(start + 30 * 86400000, to.getTime())).toISOString(),
    });
  return result;
}
export async function assertRun(runId: string) {
  const run = await db.insightRun.findUniqueOrThrow({ where: { id: runId } });
  if (["cancel_requested", "cancelled"].includes(run.status))
    throw new Error("CANCELLED");
  const m = await db.membership.findUnique({
    where: { orgId_userId: { orgId: run.orgId, userId: run.userId } },
  });
  if (
    !m ||
    (!m.allScopes &&
      !["owner", "admin"].includes(m.role) &&
      !m.scopeIds.includes(run.scopeId)) ||
    (run.kind !== "chat" && m.role === "reader")
  )
    throw new Error("ACCESS_REVOKED");
  if (run.kind === "document") {
    const d = await db.document.findUnique({ where: { id: run.resourceId! } });
    if (
      !d ||
      d.status === "deleted" ||
      (!d.scopeId && !["owner", "admin"].includes(m.role))
    )
      throw new Error("ACCESS_REVOKED");
  }
  if (run.kind === "chat") {
    const thread = await db.chatThread.findUnique({
      where: { id: run.resourceId! },
    });
    if (
      !thread ||
      thread.orgId !== run.orgId ||
      thread.scopeId !== run.scopeId ||
      (thread.visibility === "private" && thread.userId !== run.userId)
    )
      throw new Error("ACCESS_REVOKED");
  }
  return run;
}
export async function retrieveChunks(
  orgId: string,
  scopeId: string,
  query: string,
) {
  type Chunk = { id: string; text: string; documentId: string; locator: any };
  const terms = (query.match(/[\p{L}\p{N}]{3,}/gu) || [])
    .slice(0, 16)
    .join(" OR ");
  const matches = await db.$queryRaw<
    Chunk[]
  >`SELECT c.id,c.text,c."documentId",c.locator FROM "DocumentChunk" c JOIN "Document" d ON d.id=c."documentId" WHERE c."orgId"=${orgId}::uuid AND (c."scopeId" IS NULL OR c."scopeId"=${scopeId}::uuid) AND d.status IN ('ready','partial') AND (to_tsvector('russian',c.text) @@ websearch_to_tsquery('russian',${terms}) OR to_tsvector('english',c.text) @@ websearch_to_tsquery('english',${terms}) OR c.text % ${query}) ORDER BY ts_rank(to_tsvector('russian',c.text),websearch_to_tsquery('russian',${terms})) DESC LIMIT 12`;
  if (matches.length) return matches;
  // Generic questions still need a small, authorized sample of company context.
  return db.$queryRaw<
    Chunk[]
  >`SELECT c.id,c.text,c."documentId",c.locator FROM "DocumentChunk" c JOIN "Document" d ON d.id=c."documentId" WHERE c."orgId"=${orgId}::uuid AND (c."scopeId" IS NULL OR c."scopeId"=${scopeId}::uuid) AND d.status IN ('ready','partial') ORDER BY d."createdAt" DESC,c.id LIMIT 6`;
}
const State = Annotation.Root({
  plan: Annotation<SearchStep[]>(),
  sources: Annotation<RetrievedSource[]>(),
  candidates: Annotation<Candidate[]>(),
  gaps: Annotation<string[]>(),
  budget: Annotation<Budget>(),
  refinements: Annotation<number>(),
  completed: Annotation<string[]>(),
  chunks: Annotation<any[]>(),
});
export async function analysisGraph(runId: string) {
  const run = await assertRun(runId),
    snapshot = run.snapshot as any,
    settings = snapshot.settings || {},
    blocked = settings.blockedDomains || [];
  const signal = AbortSignal.timeout(config.RUN_MAX_MS);
  const guarded =
    (
      name: string,
      fn: (s: typeof State.State) => Promise<Partial<typeof State.State>>,
    ) =>
    async (s: typeof State.State) => {
      await assertRun(runId);
      signal.throwIfAborted();
      await event(runId, "progress", { node: name });
      const startedAt = Date.now();
      const result = await fn(s);
      await event(runId, "progress", {
        node: name,
        durationMs: Date.now() - startedAt,
        inputHash: digest(
          JSON.stringify({
            plan: s.plan,
            sourceIds: s.sources?.map((x) => x.id),
          }),
        ),
        sourceIds: result.sources?.map((x) => x.id).filter(Boolean),
        featureRefs: result.candidates?.flatMap(
          (x) => x.assessment.featureRefs,
        ),
        verified: name === "verify" ? result.candidates?.length : undefined,
      });
      await db.insightRun.update({
        where: { id: runId },
        data: { budget: json(result.budget || s.budget || {}) },
      });
      return result;
    };
  const graph = new StateGraph(State)
    .addNode(
      "load_context",
      guarded("load_context", async () => ({
        plan: [],
        sources: [],
        candidates: [],
        gaps: [],
        budget: newBudget(),
        refinements: 0,
        completed: [],
        chunks: await retrieveChunks(
          run.orgId,
          run.scopeId,
          String(snapshot.fields.name || ""),
        ),
      })),
    )
    .addNode(
      "plan_search",
      guarded("plan_search", async (s) => {
        let terms: string[] =
          (settings.keywords?.length
            ? settings.keywords
            : snapshot.competitors
                ?.filter((x: any) => x.data?.domain)
                .map((x: any) => x.data.domain)
                .slice(0, 3)) || [];
        if (!terms.length) terms = publicTopics(snapshot.fields);
        const budget = { ...s.budget };
        if (config.APP_MODE === "live") {
          const plan = await liveLLM.structured(
            z.object({
              topicIndices: z
                .array(z.number().int().nonnegative())
                .min(1)
                .max(6),
            }),
            "Выбери индексы публичных тем поиска, наиболее полезных профилю. Новые поисковые строки запрещены.",
            { profile: snapshot.fields, publicTopics: terms },
            budget,
            signal,
          );
          const selected = [...new Set(plan.topicIndices)]
            .filter((i) => i < terms.length)
            .map((i) => terms[i]);
          if (!selected.length) throw new Error("INVALID_SEARCH_PLAN");
          terms = selected;
        }
        const planned = windows(run.windowFrom, run.windowTo).flatMap((w) =>
          terms.map((query) => ({
            query,
            from: new Date(Date.parse(w.from) - 48 * 3600000).toISOString(),
            to: w.to,
          })),
        );
        return {
          budget,
          plan: planned.slice(0, config.RUN_MAX_SEARCH),
          gaps:
            planned.length > config.RUN_MAX_SEARCH
              ? ["План сокращён: превышен лимит поисковых запросов"]
              : [],
        };
      }),
    )
    .addNode(
      "retrieve",
      guarded("retrieve", async (s) => {
        const budget = { ...s.budget },
          sources = [...s.sources],
          gaps = s.gaps.filter(
            (g) =>
              !g.startsWith("Поиск недоступен") &&
              !g.startsWith("RSS недоступен"),
          ),
          completed = [...s.completed];
        if (config.APP_MODE === "demo")
          return {
            sources: demoSources(run.windowTo.toISOString()).filter(
              (x) =>
                !x.publishedAt ||
                Date.parse(x.publishedAt) > run.windowFrom.getTime(),
            ),
            budget,
            completed: s.plan.map((p) => JSON.stringify(p)),
          };
        const search = new BraveSearch();
        for (const p of s.plan) {
          const key = JSON.stringify(p);
          if (completed.includes(key)) continue;
          if (budget.search >= config.RUN_MAX_SEARCH) {
            gaps.push("Исчерпан бюджет поиска");
            break;
          }
          budget.search++;
          try {
            sources.push(
              ...(await search.search(p.query, p.from, p.to, signal)),
            );
            completed.push(key);
          } catch {
            gaps.push("Поиск недоступен: " + p.query);
          }
        }
        for (const url of settings.rss || []) {
          try {
            sources.push(...(await readRss(url, signal, blocked)));
          } catch {
            gaps.push("RSS недоступен: " + new URL(url).hostname);
          }
        }
        return { budget, sources, gaps, completed };
      }),
    )
    .addNode(
      "fetch_extract",
      guarded("fetch_extract", async (s) => {
        const sources: RetrievedSource[] = [],
          gaps = [...s.gaps],
          budget = { ...s.budget };
        const seen = new Set<string>();
        for (const source of s.sources) {
          let url: string;
          try {
            url = canonicalUrl(source.url);
            const host = new URL(url).hostname;
            if (
              blocked.some((d: string) => host === d || host.endsWith("." + d))
            )
              continue;
          } catch {
            continue;
          }
          if (seen.has(url)) continue;
          seen.add(url);
          let loaded = source;
          if (!source.synthetic) {
            if (budget.pages >= config.RUN_MAX_PAGES) {
              gaps.push("Исчерпан бюджет загрузки страниц");
              break;
            }
            budget.pages++;
            try {
              loaded = await extractPage(source, signal, blocked);
            } catch {
              loaded = { ...source, status: "unavailable" };
            }
          }
          if (
            loaded.publishedAt &&
            (Date.parse(loaded.publishedAt) <= run.windowFrom.getTime() ||
              Date.parse(loaded.publishedAt) > run.windowTo.getTime())
          )
            continue;
          const stored = await db.sourceDocument.upsert({
            where: { canonicalUrl: url },
            create: {
              canonicalUrl: url,
              title: loaded.title,
              publisher: loaded.publisher,
              language: loaded.language,
              publishedAt: loaded.publishedAt
                ? new Date(loaded.publishedAt)
                : null,
              checksum: digest(loaded.text),
              text: loaded.text,
              status: loaded.status,
              provenance: json({
                synthetic: !!loaded.synthetic,
                snippetOnly: loaded.status !== "available",
              }),
            },
            update: {
              title: loaded.title,
              text: loaded.text,
              checksum: digest(loaded.text),
              status: loaded.status,
              fetchedAt: new Date(),
            },
          });
          const captured = await captureSource(run, loaded);
          sources.push({ ...loaded, id: stored.id, sourceSnapshotId: captured.id });
        }
        return { sources, gaps, budget };
      }),
    )
    .addNode(
      "cluster",
      guarded("cluster", async (s) => {
        const groups = new Map<string, RetrievedSource[]>(),
          budget = { ...s.budget };
        for (const source of s.sources) {
          const key =
            source.eventKey ||
            digest(source.text.toLowerCase().replace(/\s+/g, " "));
          groups.set(key, [...(groups.get(key) || []), source]);
        }
        let sources = [...groups].map(([key, items]) => ({
          ...items[0],
          eventKey: key,
          relatedSources: items.slice(1),
        }));
        if (config.APP_MODE === "live" && sources.length) {
          const previous = await db.insight.findMany({
            where: { orgId: run.orgId, scopeId: run.scopeId },
            select: { eventKey: true, title: true },
            take: 40,
            orderBy: { updatedAt: "desc" },
          });
          const result = await liveLLM.structured(
            z.object({
              groups: z.array(
                z.object({
                  eventKey: z.string().min(1).max(200),
                  sourceIds: z.array(z.string()).min(1),
                }),
              ),
            }),
            "Объедини перепечатки одного события. Учитывай участников, вид события и дату. Для продолжения прежнего события используй прежний eventKey. Включи каждый переданный sourceId ровно один раз. Разные события не объединяй.",
            {
              previous,
              sources: sources.map((x) => ({
                id: x.id,
                title: x.title,
                text: x.text.slice(0, 1800),
                publishedAt: x.publishedAt,
              })),
            },
            budget,
            signal,
          );
          const ids = result.groups.flatMap((g) => g.sourceIds);
          if (
            new Set(ids).size !== sources.length ||
            ids.length !== sources.length ||
            !ids.every((id) => sources.some((x) => x.id === id))
          )
            throw new Error("INVALID_CLUSTER");
          sources = result.groups.map((g) => {
            const items = g.sourceIds.map(
              (id) => sources.find((x) => x.id === id)!,
            );
            return {
              ...items[0],
              eventKey: g.eventKey,
              relatedSources: [
                ...items.slice(1),
                ...items.flatMap((x) => x.relatedSources || []),
              ],
            };
          });
        }
        return { sources, budget };
      }),
    )
    .addNode(
      "assess",
      guarded("assess", async (s) => {
        const candidates: Candidate[] = [],
          budget = { ...s.budget },
          gaps = [...s.gaps];
        for (const source of s.sources) {
          try {
            const a =
              config.APP_MODE === "demo"
                ? demoAssessment(source, snapshot.fields)
                : await liveLLM.structured(
                    assessmentSchema,
                    "Оцени событие относительно профиля. featureRefs должны быть ключами fields, факты — с evidenceIds из source.id или relatedSources.id. Отсутствие связи — relevance 1. Непрочитанный источник, противоречие или неизвестная дата требуют low confidence. Перепечатки не являются независимыми подтверждениями. Укажи противоречия и недостающее основание явно в unknowns. conflicts=true при конфликте источников, correctsPrevious=true при явном опровержении, changeSummary объясняет изменение.",
                    {
                      fields: snapshot.fields,
                      source: { ...source, text: source.text.slice(0, 15000) },
                      documents: s.chunks,
                    },
                    budget,
                    signal,
                  );
            if (a.dependencyConfirmed)
              a.dependencyConfirmed = a.featureRefs.some(
                (key) =>
                  /depend|integrat|platform|technology|channel|завис|постав/i.test(
                    key,
                  ) && snapshot.fields[key]?.assertion === "confirmed",
              );
            const level = severity(a);
            if (level === "low") continue;
            const low =
              a.conflicts ||
              a.confidence === "low" ||
              source.status !== "available" ||
              !source.publishedAt;
            const evidence: EvidenceRef[] = [
              source,
              ...(source.relatedSources || []),
            ].map((item) => ({
              id: item.id!,
              sourceId: item.id!,
              sourceSnapshotId: item.sourceSnapshotId,
              quote: item.text.slice(0, 1500),
              url: item.url,
              title: item.title,
              kind: "external",
              availability:
                item.status === "available" ? "available" : "unavailable",
              ...(item.publishedAt ? { publishedAt: item.publishedAt } : {}),
            }));
            evidence.push(
              ...s.chunks.map((chunk) => ({
                id: chunk.id,
                sourceId: chunk.documentId,
                kind: "company_document" as const,
                locator: chunk.locator,
                availability: "available" as const,
              })),
              ...a.featureRefs
                .filter((key) => key in snapshot.fields)
                .map((key) => ({
                  id: "feature:" + key,
                  sourceId: key,
                  kind: "company_feature" as const,
                  profileVersionId: snapshot.profileVersionId,
                  availability: "available" as const,
                  quote: JSON.stringify(snapshot.fields[key]),
                  title: key,
                })),
            );
            candidates.push({
              key:
                source.eventKey ||
                digest(
                  source.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " "),
                ),
              fingerprint: digest(
                [
                  ...new Set(
                    [source, ...(source.relatedSources || [])].map((x) =>
                      digest(x.text),
                    ),
                  ),
                ]
                  .sort()
                  .join(":"),
              ),
              assessment: a,
              evidence,
              severity: low ? "medium" : level,
              potentialSeverity: low ? level : null,
            });
          } catch (e) {
            gaps.push(e instanceof Error ? e.message : "Ошибка оценки");
            break;
          }
        }
        return { candidates, budget, gaps };
      }),
    )
    .addNode(
      "verify",
      guarded("verify", async (s) => {
        const candidates = s.candidates.filter(
          (c) =>
            c.assessment.featureRefs.every((k) => k in snapshot.fields) &&
            c.assessment.claims.every(
              (cl) =>
                (cl.classification !== "fact" || cl.evidenceIds.length > 0) &&
                cl.evidenceIds.every((e) => c.evidence.some((x) => x.id === e)),
            ),
        );
        return {
          candidates,
          gaps:
            candidates.length < s.candidates.length
              ? [...s.gaps, "Выводы без доступных оснований исключены"]
              : s.gaps,
        };
      }),
    )
    .addNode(
      "refine",
      guarded("refine", async (s) => ({
        refinements: s.refinements + 1,
        plan: s.plan,
      })),
    )
    .addNode(
      "finalize",
      guarded("finalize", async (s) => ({ gaps: [...new Set(s.gaps)] })),
    )
    .addEdge(START, "load_context")
    .addEdge("load_context", "plan_search")
    .addEdge("plan_search", "retrieve")
    .addEdge("retrieve", "fetch_extract")
    .addEdge("fetch_extract", "cluster")
    .addEdge("cluster", "assess")
    .addEdge("assess", "verify")
    .addConditionalEdges(
      "verify",
      (s) =>
        s.gaps.some((g) => g.startsWith("Поиск недоступен")) &&
        s.refinements < 2 &&
        s.budget.search < config.RUN_MAX_SEARCH
          ? "refine"
          : "finalize",
      ["refine", "finalize"],
    )
    .addEdge("refine", "retrieve")
    .addEdge("finalize", END)
    .compile({ checkpointer });
  const existing = await graph.getState({ configurable: { thread_id: runId } });
  if (existing.values?.budget && !existing.next?.length)
    return existing.values as typeof State.State;
  return graph.invoke(existing.next?.length ? null : {}, {
    configurable: { thread_id: runId },
    recursionLimit: 50,
  });
}
const ChatState = Annotation.Root({
  context: Annotation<any>(),
  answer: Annotation<string>(),
  citations: Annotation<EvidenceRef[]>(),
  budget: Annotation<Budget>(),
});
export async function chatGraph(runId: string) {
  const run = await assertRun(runId);
  const input = run.snapshot as any;
  const graph = new StateGraph(ChatState)
    .addNode("load_context", async () => {
      await assertRun(runId);
      const thread = await db.chatThread.findUniqueOrThrow({
        where: { id: run.resourceId! },
      });
      const visibleThreads = await db.chatThread.findMany({
        where: {
          orgId: run.orgId,
          scopeId: run.scopeId,
          OR: [{ visibility: "shared" }, { id: thread.id }],
        },
        select: { id: true },
      });
      const decisions = await db.decision.findMany({
        where: {
          orgId: run.orgId,
          scopeId: run.scopeId,
          threadId: { in: visibleThreads.map((t) => t.id) },
        },
        orderBy: { createdAt: "desc" },
        take: 8,
      });
      const history = await db.chatMessage.findMany({
        where: { threadId: thread.id, status: "complete" },
        orderBy: { createdAt: "desc" },
        take: 12,
      });
      const insight = thread.insightId
        ? await db.insight.findUnique({ where: { id: thread.insightId } })
        : null;
      const revision = insight?.latestRevisionId
        ? await db.insightRevision.findUnique({
            where: { id: insight.latestRevisionId },
          })
        : null;
      const chunks = await retrieveChunks(
        run.orgId,
        run.scopeId,
        input.question,
      );
      const deleted = new Set(
        (
          await db.document.findMany({
            where: { orgId: run.orgId, status: "deleted" },
            select: { id: true },
          })
        ).map((d) => d.id),
      );
      const available = (refs: EvidenceRef[]) =>
        refs.filter(
          (ref) =>
            ref.kind !== "company_document" || !deleted.has(ref.sourceId),
        );
      const safeHistory = history.filter(
        (message) =>
          available(message.citations as EvidenceRef[]).length ===
          (message.citations as EvidenceRef[]).length,
      );
      const revisionAvailable =
        !revision ||
        available(revision.evidence as EvidenceRef[]).length ===
          (revision.evidence as EvidenceRef[]).length;
      return {
        context: {
          profile: input.profile,
          history: safeHistory.reverse(),
          decisions,
          insight: revisionAvailable ? revision?.data : undefined,
          chunks,
        },
        citations: [
          ...available((revision?.evidence as EvidenceRef[]) || []),
          ...chunks.map((c) => ({
            id: c.id,
            kind: "company_document" as const,
            sourceId: c.documentId,
            locator: c.locator,
            availability: "available" as const,
          })),
        ],
        budget: newBudget({
          llm: config.CHAT_MAX_LLM,
          tokens: config.CHAT_MAX_TOKENS,
        }),
      };
    })
    .addNode("compose_answer", async (s) => {
      await assertRun(runId);
      const schema = z.object({
        text: z.string(),
        evidenceIds: z.array(z.string()),
      });
      let result;
      if (config.APP_MODE === "demo")
        result = {
          text:
            "Это демонстрационный разбор на синтетических данных.\n\n" +
            (s.context.insight
              ? `Основание: ${s.context.insight.summary}\n\n`
              : "") +
            "Для вашего проекта сначала стоит проверить, затрагивает ли событие целевую аудиторию и текущую гипотезу. Затем сравнить доступные варианты на небольшом эксперименте.\n\nЧто пока неизвестно: фактическая зависимость, стоимость изменений и ожидаемый эффект. Какую гипотезу вы хотите проверить первой?",
          evidenceIds: s.citations.map((x) => x.id),
        };
      else
        result = await liveLLM.structured(
          schema,
          "Ответь на вопрос с опорой на контекст. Ссылайся только на evidenceIds из переданного списка. Не утверждай, что предложение уже выполнено.",
          { ...s.context, question: input.question, evidence: s.citations },
          s.budget,
        );
      if (
        s.budget.llm > config.CHAT_MAX_LLM ||
        s.budget.inputTokens + s.budget.outputTokens > config.CHAT_MAX_TOKENS
      )
        throw new Error("CHAT_BUDGET_EXHAUSTED");
      if (
        !result.evidenceIds.every((id) => s.citations.some((e) => e.id === id))
      )
        throw new Error("INVALID_EVIDENCE");
      return {
        answer: result.text,
        citations: s.citations.filter((x) => result.evidenceIds.includes(x.id)),
        budget: s.budget,
      };
    })
    .addNode("verify", async (s) => {
      await assertRun(runId);
      for (const ref of s.citations)
        if (ref.kind === "company_document") {
          const doc = await db.document.findUnique({
            where: { id: ref.sourceId },
          });
          if (!doc || doc.status === "deleted")
            throw new Error("SOURCE_DELETED");
        }
      return {};
    })
    .addEdge(START, "load_context")
    .addEdge("load_context", "compose_answer")
    .addEdge("compose_answer", "verify")
    .addEdge("verify", END)
    .compile({ checkpointer });
  const state = await graph.getState({ configurable: { thread_id: runId } });
  if (state.values?.budget && !state.next?.length)
    return state.values as typeof ChatState.State;
  return graph.invoke(state.next?.length ? null : {}, {
    configurable: { thread_id: runId },
  });
}
const CompetitorState = Annotation.Root({
  sources: Annotation<RetrievedSource[]>(),
  proposals: Annotation<any[]>(),
  budget: Annotation<Budget>(),
});
export async function competitorsGraph(runId: string) {
  const run = await assertRun(runId),
    snapshot = run.snapshot as any;
  const graph = new StateGraph(CompetitorState)
    .addNode("retrieve", async () => {
      await assertRun(runId);
      const budget = newBudget();
      if (config.APP_MODE === "demo")
        return { sources: demoSources(run.windowTo.toISOString()), budget };
      budget.search++;
      const terms = (
        snapshot.settings?.keywords?.length
          ? snapshot.settings.keywords
          : publicTopics(snapshot.fields).slice(0, 2)
      ).join(" ");
      return {
        sources: await new BraveSearch().search(
          terms + " competitors alternatives",
          undefined,
          undefined,
        ),
        budget,
      };
    })
    .addNode("propose", async (s) => {
      await assertRun(runId);
      if (config.APP_MODE === "demo")
        return {
          proposals: [
            {
              name: "Орбита · demo",
              domain: "orbita.example.test",
              type: "alternative",
              reason:
                "Синтетический пример альтернативного способа решения задачи",
              sources: [s.sources[0]?.url],
              fingerprint: digest("orbita-demo"),
            },
          ],
          budget: s.budget,
        };
      const schema = z.object({
        proposals: z
          .array(
            z.object({
              name: z.string(),
              domain: z.string(),
              type: z.enum(["direct", "indirect", "alternative"]),
              reason: z.string(),
              sources: z.array(z.url()).min(1),
            }),
          )
          .max(8),
      });
      const result = await liveLLM.structured(
        schema,
        "Предложи конкурентов по источникам. Только существующие ссылки из sources, не компании по памяти.",
        { profile: snapshot.fields, sources: s.sources },
        s.budget,
      );
      return { proposals: result.proposals, budget: s.budget };
    })
    .addNode("verify", async (s) => {
      await assertRun(runId);
      return {
        proposals: s.proposals.filter((p) =>
          p.sources.every((url: string) =>
            s.sources.some((x) => x.url === url),
          ),
        ),
      };
    })
    .addEdge(START, "retrieve")
    .addEdge("retrieve", "propose")
    .addEdge("propose", "verify")
    .addEdge("verify", END)
    .compile({ checkpointer });
  const state = await graph.getState({ configurable: { thread_id: runId } });
  if (state.values?.budget && !state.next?.length)
    return state.values as typeof CompetitorState.State;
  return graph.invoke(state.next?.length ? null : {}, {
    configurable: { thread_id: runId },
  });
}
