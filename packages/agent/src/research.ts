import { Annotation, StateGraph, START, END } from "@langchain/langgraph";
import { z } from "zod";
import { db, json } from "@context/db";
import { config } from "@context/config";
import {
  factSchema,
  briefContentSchema,
  stageQuestions,
  type ResearchFact,
  type BriefContent,
} from "@context/contracts";
import { assertRun, checkpointer } from "./graphs.ts";
import { captureSource } from "./snapshots.ts";
import {
  BraveSearch,
  extractPage,
  canonicalUrl,
  type RetrievedSource,
} from "./sources.ts";
import { liveLLM, newBudget, type Budget } from "./providers.ts";
import { publicTopics } from "./planning.ts";
import { event } from "../../db/src/jobs.ts";
import {
  factChanges,
  sourceConflicts,
  verifyFacts,
} from "./research-domain.ts";

type CompetitorPlan = {
  id: string;
  name: string;
  domain?: string;
  pages: { url: string; category: string }[];
};
type Input = {
  fields: Record<string, unknown>;
  stage?: string;
  settings: { keywords?: string[]; blockedDomains?: string[] };
  competitors: CompetitorPlan[];
  includeMarket: boolean;
};
type Source = {
  id: string;
  competitorId: string | null;
  canonicalUrl: string;
  title: string;
  text: string;
  checksum: string;
  publishedAt: string | null;
  observedAt: string;
  status: string;
};
type Dossier = { competitorId: string; facts: ResearchFact[]; gaps: string[] };
const State = Annotation.Root({
  sources: Annotation<Source[]>(),
  dossiers: Annotation<Dossier[]>(),
  gaps: Annotation<string[]>(),
  budget: Annotation<Budget>(),
  brief: Annotation<BriefContent>(),
  changes: Annotation<ReturnType<typeof factChanges>>(),
});
export function demoResearchPage(
  name: string,
  url: string,
  stage: string,
): RetrievedSource {
  const upgraded = new URL(url).searchParams.get("scenario") === "updated";
  const price = upgraded ? "3900" : "2900";
  return {
    url,
    title: `${name} · демонстрационный источник`,
    publisher: name,
    language: "ru",
    publishedAt: null,
    status: "available",
    synthetic: true,
    text: `${name} — синтетический пример, не реальная компания.\nАудитория: команды малого бизнеса от 3 до 20 сотрудников.\nПредложение: единое рабочее место для отчётности и совместного анализа.\nВозможности: отчёты, экспорт CSV, совместные рабочие пространства.\nТариф: ${price} RUB за рабочее пространство в месяц, до 5 участников, НДС не указан.\nИнтеграции: импорт CSV и API.\nКейсы: публичных подтверждённых кейсов нет.\nКонтекст: ${stageQuestions[stage] || stageQuestions.mvp}`,
  };
}
function demoFacts(source: Source): ResearchFact[] {
  const lines = source.text.split("\n");
  const fields = [
    "audience",
    "offer",
    "features",
    "pricing",
    "integrations",
  ] as const;
  return fields.map((field, i) => ({
    field,
    value: lines[i + 1].split(": ").slice(1).join(": "),
    quote: lines[i + 1],
    sourceSnapshotId: source.id,
    observedAt: source.observedAt,
    classification: "company_claim",
    price:
      field === "pricing"
        ? {
            amount: source.text.includes("3900") ? "3900" : "2900",
            currency: "RUB",
            period: "month",
            unit: "workspace",
            conditions: "До 5 участников; НДС не указан",
          }
        : null,
  }));
}
export async function researchGraph(runId: string) {
  const run = await assertRun(runId),
    input = run.snapshot as unknown as Input;
  const signal = AbortSignal.timeout(config.RUN_MAX_MS);
  const guard =
    (
      node: string,
      fn: (state: typeof State.State) => Promise<Partial<typeof State.State>>,
    ) =>
    async (state: typeof State.State) => {
      await assertRun(runId);
      signal.throwIfAborted();
      await event(runId, "progress", { node });
      const started = Date.now();
      const result = await fn(state);
      console.log(
        JSON.stringify({
          runId,
          node,
          durationMs: Date.now() - started,
          code: "NODE_COMPLETED",
        }),
      );
      return result;
    };
  const graph = new StateGraph(State)
    .addNode(
      "context",
      guard("context", async () => ({
        sources: [],
        dossiers: [],
        gaps: [],
        budget: newBudget(),
        changes: [],
      })),
    )
    .addNode(
      "plan",
      guard("plan", async () => {
        if (!input.competitors.length || input.competitors.length > 5)
          throw new Error("INVALID_RESEARCH_PLAN");
        return {};
      }),
    )
    .addNode(
      "retrieve",
      guard("retrieve", async (s) => {
        const budget = { ...s.budget },
          sources = [...s.sources],
          gaps = [...s.gaps];
        const collect = async (
          raw: RetrievedSource,
          competitorId: string | null,
        ) => {
          if (budget.pages >= config.RUN_MAX_PAGES) {
            gaps.push("Достигнут лимит страниц");
            return;
          }
          budget.pages++;
          try {
            await assertRun(runId);
            const loaded = raw.synthetic
              ? raw
              : await extractPage(
                  raw,
                  signal,
                  input.settings?.blockedDomains || [],
                );
            const captured = await captureSource(run, loaded);
            sources.push({
              ...captured,
              competitorId,
              observedAt: captured.observedAt.toISOString(),
              publishedAt: captured.publishedAt?.toISOString() || null,
            });
          } catch (error) {
            if (
              error instanceof Error &&
              ["CANCELLED", "ACCESS_REVOKED"].includes(error.message)
            )
              throw error;
            gaps.push(
              `Источник недоступен: ${new URL(raw.url).hostname}. Это не свидетельство изменения продукта.`,
            );
          }
        };
        for (const competitor of input.competitors) {
          let urls = competitor.pages.map((p) => p.url).slice(0, 5);
          if (!urls.length && competitor.domain)
            urls = [
              `https://${competitor.domain.replace(/^https?:\/\//, "").replace(/\/$/, "")}/`,
            ];
          if (config.APP_MODE === "demo") {
            const url =
              urls[0] || `https://demo-${competitor.id}.example.test/product`;
            await collect(
              demoResearchPage(competitor.name, url, input.stage || "mvp"),
              competitor.id,
            );
            continue;
          }
          if (budget.search < config.RUN_MAX_SEARCH && urls.length < 5) {
            budget.search++;
            try {
              const found = await new BraveSearch().search(
                `${competitor.domain ? "site:" + competitor.domain : competitor.name} product pricing features`,
                undefined,
                undefined,
                signal,
              );
              urls = [...new Set([...urls, ...found.map((x) => x.url)])].slice(
                0,
                5,
              );
            } catch {
              gaps.push(`Поиск конкурента недоступен: ${competitor.name}`);
            }
          }
          for (const url of urls)
            await collect(
              {
                url: canonicalUrl(url),
                title: competitor.name,
                text: "",
                publisher: competitor.name,
                language: "unknown",
                publishedAt: null,
                status: "snippet_only",
              },
              competitor.id,
            );
          if (!urls.length) gaps.push(`Нет источников: ${competitor.name}`);
        }
        if (
          input.includeMarket &&
          config.APP_MODE !== "demo" &&
          budget.search < config.RUN_MAX_SEARCH
        ) {
          budget.search++;
          try {
            const topics = input.settings?.keywords?.length
              ? input.settings.keywords
              : publicTopics(input.fields);
            const found = await new BraveSearch().search(
              topics.slice(0, 2).join(" "),
              run.windowFrom.toISOString(),
              run.windowTo.toISOString(),
              signal,
            );
            for (const source of found.slice(0, 5)) await collect(source, null);
          } catch {
            gaps.push("Рыночный поиск недоступен");
          }
        }
        return { sources, gaps, budget };
      }),
    )
    .addNode(
      "extract",
      guard("extract", async (s) => {
        const budget = { ...s.budget },
          dossiers: Dossier[] = [];
        for (const competitor of input.competitors) {
          await assertRun(runId);
          const sources = s.sources.filter(
            (x) => x.competitorId === competitor.id,
          );
          if (!sources.length) {
            dossiers.push({
              competitorId: competitor.id,
              facts: [],
              gaps: ["Нет доступных оснований"],
            });
            continue;
          }
          let facts: ResearchFact[];
          if (config.APP_MODE === "demo") facts = demoFacts(sources[0]);
          else {
            try {
              const answer = await liveLLM.structured(
                z.object({ facts: z.array(factSchema).max(25) }),
                "Извлеки досье конкурента. Каждое поле требует точную цитату и sourceSnapshotId из переданных источников. Заявления сайта — company_claim, а не доказанный результат. Отсутствие сведений не означает отсутствия функции: пропусти поле. Для pricing укажи сумму, валюту, период, единицу и ограничения, только если они явно известны; иначе price=null. Сохрани противоречащие утверждения раздельно.",
                {
                  competitor: competitor.name,
                  sources: sources.map((x) => ({
                    ...x,
                    text: x.text.slice(0, 4500),
                  })),
                },
                budget,
                signal,
              );
              facts = answer.facts;
            } catch (error) {
              if (
                !(error instanceof Error) ||
                error.message !== "BUDGET_EXHAUSTED"
              )
                throw error;
              dossiers.push({
                competitorId: competitor.id,
                facts: [],
                gaps: ["Недостаточно бюджета для извлечения"],
              });
              continue;
            }
          }
          const verified = verifyFacts(facts, sources);
          const conflicts = sourceConflicts(verified);
          dossiers.push({
            competitorId: competitor.id,
            facts: verified,
            gaps: [
              ...(verified.length < facts.length
                ? ["Часть утверждений отклонена: цитаты не подтверждены"]
                : []),
              ...conflicts.map((field) => `Противоречивые сведения: ${field}`),
              ...(!verified.length ? ["Нет подтверждённых полей"] : []),
            ],
          });
        }
        return { dossiers, budget };
      }),
    )
    .addNode(
      "compare",
      guard("compare", async (s) => {
        const changes: ReturnType<typeof factChanges> = [];
        for (const dossier of s.dossiers) {
          const previous = await db.competitorSnapshot.findFirst({
            where: {
              competitorId: dossier.competitorId,
              runId: { not: runId },
            },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          });
          if (previous)
            changes.push(
              ...factChanges(
                z.array(factSchema).parse(previous.facts),
                dossier.facts,
              ),
            );
        }
        return { changes };
      }),
    )
    .addNode(
      "verify",
      guard("verify", async (s) => ({
        gaps: [...s.gaps, ...s.dossiers.flatMap((d) => d.gaps)],
      })),
    )
    .addNode(
      "compose_brief",
      guard("compose_brief", async (s) => {
        const budget = { ...s.budget };
        const fallback: BriefContent = {
          observation: s.changes.length
            ? `Обнаружено содержательных изменений: ${s.changes.length}. Сравните прежние и новые условия.`
            : "Исследование зафиксировало доступные предложения. Новых подтверждённых изменений не обнаружено.",
          implication:
            "Досье показывает публичные заявления компаний, а не доказательство их результатов. Сопоставьте предложения с задачей своего клиента.",
          response:
            "Гипотеза: объяснять отличие через конкретный сценарий клиента, а не через количество функций.",
          validation:
            stageQuestions[input.stage || "mvp"] || stageQuestions.mvp,
          opportunities:
            config.APP_MODE === "demo" &&
            input.includeMarket &&
            s.sources.length
              ? [
                  {
                    category: "positioning",
                    text: "Гипотеза для demo: проверить на интервью, помогает ли прозрачная цена за рабочее пространство объяснить ценность небольшим командам.",
                    sourceSnapshotIds: [s.sources[0].id],
                  },
                ]
              : [],
          unknowns: [
            ...s.gaps,
            "Спрос и эффективность каналов требуют проверки на клиентах.",
          ],
        };
        if (config.APP_MODE === "demo" || !s.sources.length)
          return { brief: fallback, budget };
        try {
          const brief = await liveLLM.structured(
            briefContentSchema,
            "Подготовь краткую записку основателю: наблюдение, значение для клиента, возможный ответ, проверка. Любые рекомендации — гипотезы, не обещания результата. Возможности только с sourceSnapshotIds из оснований. Если includeMarket=false, opportunities=[]. Не делай выводов об отсутствии функции из отсутствия данных.",
            {
              profile: input.fields,
              stage: input.stage,
              includeMarket: input.includeMarket,
              dossiers: s.dossiers,
              changes: s.changes,
              sources: s.sources.map((x) => ({
                id: x.id,
                title: x.title,
                text: x.text.slice(0, 1600),
              })),
            },
            budget,
            signal,
          );
          brief.opportunities = brief.opportunities.filter((o) =>
            o.sourceSnapshotIds.every((id) =>
              s.sources.some((x) => x.id === id),
            ),
          );
          if (!input.includeMarket) brief.opportunities = [];
          return { brief, budget };
        } catch (error) {
          if (!(error instanceof Error) || error.message !== "BUDGET_EXHAUSTED")
            throw error;
          return {
            brief: {
              ...fallback,
              unknowns: [
                ...fallback.unknowns,
                "Бюджет исчерпан: аналитическая записка не сгенерирована LLM",
              ],
            },
            budget,
            gaps: [...s.gaps, "Бюджет LLM исчерпан"],
          };
        }
      }),
    )
    .addNode(
      "persist",
      guard("persist", async (s) => {
        await db.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${run.scopeId}))`;
          const live = await tx.insightRun.findUniqueOrThrow({
            where: { id: runId },
          });
          if (live.status === "succeeded" || live.status === "partial") return;
          if (live.status !== "running") throw new Error("CANCELLED");
          const membership = await tx.membership.findUnique({
            where: { orgId_userId: { orgId: run.orgId, userId: run.userId } },
          });
          if (
            !membership ||
            membership.role === "reader" ||
            (!membership.allScopes &&
              !["owner", "admin"].includes(membership.role) &&
              !membership.scopeIds.includes(run.scopeId))
          )
            throw new Error("ACCESS_REVOKED");
          for (const dossier of s.dossiers) {
            // Missing evidence never erases the last successful baseline.
            if (!dossier.facts.length) continue;
            const previous = await tx.competitorSnapshot.findFirst({
              where: {
                competitorId: dossier.competitorId,
                runId: { not: runId },
              },
              orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            });
            const saved = await tx.competitorSnapshot.upsert({
              where: {
                runId_competitorId: {
                  runId,
                  competitorId: dossier.competitorId,
                },
              },
              create: {
                orgId: run.orgId,
                scopeId: run.scopeId,
                competitorId: dossier.competitorId,
                runId,
                facts: json(dossier.facts),
                gaps: json(dossier.gaps),
              },
              update: {},
            });
            if (previous)
              for (const change of factChanges(
                z.array(factSchema).parse(previous.facts),
                dossier.facts,
              )) {
                await tx.competitorChange.upsert({
                  where: {
                    runId_competitorId_field: {
                      runId,
                      competitorId: dossier.competitorId,
                      field: change.field,
                    },
                  },
                  create: {
                    orgId: run.orgId,
                    scopeId: run.scopeId,
                    competitorId: dossier.competitorId,
                    runId,
                    field: change.field,
                    before: json(change.before),
                    after: json(change.after),
                    beforeSnapshotId: previous.id,
                    afterSnapshotId: saved.id,
                  },
                  update: {},
                });
              }
          }
          await tx.researchBrief.upsert({
            where: { runId },
            create: {
              orgId: run.orgId,
              scopeId: run.scopeId,
              runId,
              title: "Рынок и ваше предложение",
              content: json(s.brief),
              evidence: json(
                s.sources.map(({ competitorId: _competitorId, ...x }) => ({
                  ...x,
                  text: x.text.slice(0, 4000),
                })),
              ),
            },
            update: {},
          });
          await tx.insightRun.update({
            where: { id: runId },
            data: {
              status: s.gaps.length ? "partial" : "succeeded",
              finishedAt: new Date(),
              budget: json(s.budget),
              coverage: json({
                gaps: s.gaps,
                sourceCount: s.sources.length,
                acceptable: false,
              }),
            },
          });
        });
        return {};
      }),
    )
    .addEdge(START, "context")
    .addEdge("context", "plan")
    .addEdge("plan", "retrieve")
    .addEdge("retrieve", "extract")
    .addEdge("extract", "compare")
    .addEdge("compare", "verify")
    .addEdge("verify", "compose_brief")
    .addEdge("compose_brief", "persist")
    .addEdge("persist", END)
    .compile({ checkpointer });
  const state = await graph.getState({ configurable: { thread_id: runId } });
  if (state.values?.brief && !state.next?.length)
    return state.values as typeof State.State;
  return graph.invoke(state.next?.length ? null : {}, {
    configurable: { thread_id: runId },
  });
}
