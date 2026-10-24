import { Router } from "express";
import { z } from "zod";
import { db, json } from "@context/db";
import {
  researchInput,
  watchInput,
  manualFactsInput,
  briefContentSchema,
  factSchema,
} from "@context/contracts";
import { publicConfig } from "@context/config";
import { access, authenticated, effectiveProfile, fail, id } from "./core.ts";
import { enqueue } from "../../../packages/db/src/jobs.ts";
import {
  validateUrl,
  canonicalUrl,
} from "../../../packages/agent/src/sources.ts";
export const research = Router({ mergeParams: true });
research.use(async (req, _res, next) => {
  await access(
    authenticated(req),
    id(req, "orgId"),
    id(req, "scopeId"),
    req.method !== "GET",
  );
  next();
});
const ids = (req: Parameters<typeof id>[0]) => ({
  orgId: id(req, "orgId"),
  scopeId: id(req, "scopeId"),
});
research.post("/research-runs", async (req, res) => {
  if (!publicConfig().ready.analysis)
    fail(503, "SEARCH_NOT_READY", "Настройте LLM и поиск на сервере");
  const where = ids(req),
    input = researchInput.parse(req.body);
  const competitors = await db.competitor.findMany({
    where: {
      ...where,
      id: { in: input.competitorIds },
      decision: "confirmed",
      monitoring: "active",
    },
  });
  if (competitors.length !== input.competitorIds.length)
    fail(
      422,
      "INVALID_COMPETITORS",
      "Выберите подтверждённых активных конкурентов этого направления",
    );
  const pages = await db.competitorWatchSource.findMany({
    where: { ...where, competitorId: { in: input.competitorIds } },
  });
  const scope = await db.analysisScope.findUniqueOrThrow({
    where: { id: where.scopeId },
  });
  const org = await db.organization.findUniqueOrThrow({
    where: { id: where.orgId },
  });
  res
    .status(202)
    .json(
      await enqueue({
        ...where,
        userId: authenticated(req),
        kind: "research",
        from: new Date(Date.now() - 30 * 86400000),
        to: new Date(),
        key: z.string().min(8).parse(req.get("Idempotency-Key")),
        payload: input,
        snapshot: {
          ...(await effectiveProfile(where.orgId, where.scopeId)),
          stage: org.stage,
          settings: scope.settings,
          includeMarket: input.includeMarket,
          competitors: competitors.map((c) => ({
            id: c.id,
            name: c.name,
            domain: (c.data as { domain?: string }).domain,
            pages: pages
              .filter((p) => p.competitorId === c.id)
              .map((p) => ({ url: p.url, category: p.category })),
          })),
        },
      }),
    );
});
research.get("/research-runs", async (req, res) => {
  const limit = z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .parse(req.query.limit);
  let cursor: { acceptedAt: string; id: string } | undefined;
  if (req.query.cursor) {
    try {
      cursor = z
        .object({ acceptedAt: z.iso.datetime(), id: z.uuid() })
        .parse(
          JSON.parse(
            Buffer.from(String(req.query.cursor), "base64url").toString(),
          ),
        );
    } catch {
      fail(422, "INVALID_CURSOR", "Некорректный курсор");
    }
  }
  const rows = await db.insightRun.findMany({
    where: {
      ...ids(req),
      kind: "research",
      ...(cursor
        ? {
            OR: [
              { acceptedAt: { lt: new Date(cursor.acceptedAt) } },
              {
                acceptedAt: new Date(cursor.acceptedAt),
                id: { lt: cursor.id },
              },
            ],
          }
        : {}),
    },
    orderBy: [{ acceptedAt: "desc" }, { id: "desc" }],
    take: limit + 1,
  });
  const items = rows.slice(0, limit),
    last = items.at(-1);
  res.json({
    items,
    nextCursor:
      rows.length > limit && last
        ? Buffer.from(
            JSON.stringify({ acceptedAt: last.acceptedAt, id: last.id }),
          ).toString("base64url")
        : null,
  });
});
research.get("/research-runs/:runId", async (req, res) => {
  const run = await db.insightRun.findFirst({
    where: { ...ids(req), id: id(req, "runId"), kind: "research" },
  });
  if (!run) fail(404, "NOT_FOUND", "Исследование не найдено");
  res.json(run);
});
research.post("/research-runs/:runId/cancel", async (req, res) => {
  const updated = await db.insightRun.updateMany({
    where: {
      ...ids(req),
      id: id(req, "runId"),
      kind: "research",
      status: { in: ["queued", "running"] },
    },
    data: { status: "cancel_requested" },
  });
  if (!updated.count)
    fail(409, "RUN_FINISHED", "Исследование уже завершено или отменяется");
  res.json({ ok: true });
});
research.get("/market-overview", async (req, res) => {
  const where = ids(req),
    days = z.coerce
      .number()
      .int()
      .min(1)
      .max(365)
      .default(30)
      .parse(req.query.days),
    since = new Date(Date.now() - days * 86400000);
  const [competitors, changes, briefs, runs, lastSuccess] = await Promise.all([
    db.competitor.findMany({ where, orderBy: { name: "asc" } }),
    db.competitorChange.findMany({
      where: { ...where, createdAt: { gte: since } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 30,
    }),
    db.researchBrief.findMany({
      where: { ...where, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    db.insightRun.findMany({
      where: { ...where, kind: "research" },
      orderBy: { acceptedAt: "desc" },
      take: 10,
    }),
    db.insightRun.findFirst({
      where: { ...where, kind: "research", status: "succeeded" },
      orderBy: { finishedAt: "desc" },
    }),
  ]);
  res.json({
    competitors,
    changes,
    briefs,
    runs,
    lastSuccess: lastSuccess?.finishedAt || null,
    gaps: (runs[0]?.coverage as { gaps?: string[] })?.gaps || [],
  });
});
async function competitor(
  where: { orgId: string; scopeId: string },
  competitorId: string,
) {
  const row = await db.competitor.findFirst({
    where: { ...where, id: competitorId },
  });
  return row || fail(404, "NOT_FOUND", "Конкурент не найден");
}
research.get("/competitors/:competitorId/dossier", async (req, res) => {
  const where = ids(req),
    competitorId = id(req, "competitorId");
  const row = await competitor(where, competitorId);
  const [snapshots, changes, sources] = await Promise.all([
    db.competitorSnapshot.findMany({
      where: { ...where, competitorId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 30,
    }),
    db.competitorChange.findMany({
      where: { ...where, competitorId },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    db.competitorWatchSource.findMany({
      where: { ...where, competitorId },
      orderBy: { id: "asc" },
    }),
  ]);
  res.json({ competitor: row, snapshots, changes, sources });
});
research.post("/competitors/:competitorId/watch-sources", async (req, res) => {
  const where = ids(req),
    competitorId = id(req, "competitorId"),
    row = await competitor(where, competitorId);
  if (row.decision !== "confirmed")
    fail(422, "CONFIRM_COMPETITOR", "Сначала подтвердите конкурента");
  const input = watchInput.parse(req.body),
    scope = await db.analysisScope.findUniqueOrThrow({
      where: { id: where.scopeId },
    });
  validateUrl(
    input.url,
    (scope.settings as { blockedDomains?: string[] }).blockedDomains,
  );
  const url = canonicalUrl(input.url);
  const source = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${competitorId}))`;
    const existing = await tx.competitorWatchSource.findUnique({
      where: { competitorId_url: { competitorId, url } },
    });
    if (existing) return existing;
    if (
      (await tx.competitorWatchSource.count({ where: { competitorId } })) >= 5
    )
      fail(422, "SOURCE_LIMIT", "Не больше пяти страниц на конкурента");
    return tx.competitorWatchSource.create({
      data: { ...where, competitorId, url, category: input.category },
    });
  });
  res.status(201).json(source);
});
research.delete(
  "/competitors/:competitorId/watch-sources/:watchId",
  async (req, res) => {
    const version = z.number().int().positive().parse(req.body.expectedVersion);
    const result = await db.competitorWatchSource.deleteMany({
      where: {
        ...ids(req),
        competitorId: id(req, "competitorId"),
        id: id(req, "watchId"),
        version,
      },
    });
    if (!result.count)
      fail(409, "VERSION_CONFLICT", "Страница уже изменена или удалена");
    res.json({ ok: true });
  },
);
research.patch("/competitors/:competitorId/manual-facts", async (req, res) => {
  const row = await competitor(ids(req), id(req, "competitorId")),
    input = manualFactsInput.parse(req.body);
  const result = await db.competitor.updateMany({
    where: { id: row.id, revision: input.expectedVersion },
    data: {
      data: json({ ...(row.data as object), manualFacts: input.fields }),
      revision: { increment: 1 },
      userEdited: true,
    },
  });
  if (!result.count)
    fail(409, "VERSION_CONFLICT", "Досье изменилось. Обновите страницу");
  res.json({ ok: true });
});
research.get("/competitor-comparison", async (req, res) => {
  const where = ids(req),
    selected = z
      .array(z.uuid())
      .min(2)
      .max(5)
      .parse(String(req.query.ids || "").split(","));
  if (new Set(selected).size !== selected.length)
    fail(422, "VALIDATION", "Выберите разных конкурентов");
  const rows = await db.competitor.findMany({
    where: { ...where, id: { in: selected }, decision: "confirmed" },
  });
  if (rows.length !== selected.length)
    fail(404, "NOT_FOUND", "Конкурент не найден");
  const snapshots = await db.competitorSnapshot.findMany({
    where: { ...where, competitorId: { in: selected } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    distinct: ["competitorId"],
  });
  res.json({
    own: (await effectiveProfile(where.orgId, where.scopeId)).fields,
    competitors: rows.map((c) => {
      const snapshot = snapshots.find((s) => s.competitorId === c.id);
      return {
        competitor: c,
        facts: snapshot ? z.array(factSchema).parse(snapshot.facts) : [],
        manual:
          (c.data as { manualFacts?: Record<string, string> }).manualFacts ||
          {},
        observedAt: snapshot?.createdAt || null,
      };
    }),
  });
});
research.get("/source-snapshots/:snapshotId", async (req, res) => {
  const sourceSnapshotId = id(req, "snapshotId");
  if (
    !(await db.runSource.findFirst({
      where: { ...ids(req), sourceSnapshotId },
    }))
  )
    fail(404, "NOT_FOUND", "Источник не найден");
  res.json(
    await db.sourceSnapshot.findUniqueOrThrow({
      where: { id: sourceSnapshotId },
    }),
  );
});
async function getBrief(req: Parameters<typeof id>[0]) {
  return (
    (await db.researchBrief.findFirst({
      where: { ...ids(req), id: id(req, "briefId") },
    })) || fail(404, "NOT_FOUND", "Записка не найдена")
  );
}
research.get("/research-briefs", async (req, res) =>
  res.json({
    items: await db.researchBrief.findMany({
      where: ids(req),
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  }),
);
research.post("/research-briefs", async (req, res) => {
  const runId = z.uuid().parse(req.body.runId);
  const brief = await db.researchBrief.findFirst({
    where: { ...ids(req), runId },
  });
  if (!brief)
    fail(409, "BRIEF_NOT_READY", "Записка появится после исследования");
  res.json(brief);
});
research.get("/research-briefs/:briefId", async (req, res) =>
  res.json(await getBrief(req)),
);
research.post("/research-briefs/:briefId/decision", async (req, res) => {
  if (req.body.confirm !== true)
    fail(422, "CONFIRM_REQUIRED", "Подтвердите сохранение в журнал команды");
  const brief = await getBrief(req),
    content = briefContentSchema.parse(brief.content);
  const decision = await db.decision.upsert({
    where: { briefId: brief.id },
    create: {
      ...ids(req),
      userId: authenticated(req),
      briefId: brief.id,
      threadId: null,
      assertion: "hypothesis",
      text: `${content.observation}\n\n${content.response}\n\nПроверка: ${content.validation}`,
    },
    update: {},
  });
  res.status(201).json(decision);
});
research.get("/research-decisions", async (req, res) =>
  res.json({
    items: await db.decision.findMany({
      where: { ...ids(req), briefId: { not: null } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  }),
);
research.get("/research-briefs/:briefId/export", async (req, res) => {
  const brief = await getBrief(req),
    c = briefContentSchema.parse(brief.content);
  const evidence = z
    .array(
      z.object({
        title: z.string(),
        canonicalUrl: z.string(),
        observedAt: z.string(),
      }),
    )
    .parse(brief.evidence);
  const text = `# ${brief.title}\n\n${brief.createdAt.toISOString()}\n\n## Наблюдение\n${c.observation}\n\n## Значение для клиента\n${c.implication}\n\n## Возможный ответ — гипотеза\n${c.response}\n\n## Что проверить\n${c.validation}\n\n## Неизвестное\n${c.unknowns.map((x) => "- " + x).join("\n")}\n\n## Источники\n${evidence.map((x) => `- ${x.title.replace(/[\r\n]/g, " ")}: ${x.canonicalUrl} (наблюдение ${x.observedAt})`).join("\n")}\n`;
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="research-${brief.id}.md"`,
  );
  res.type("text/markdown").send(text);
});
