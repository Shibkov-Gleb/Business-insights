import { Router, type Request } from "express";
import { z } from "zod";
import multer from "multer";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { db, json, Prisma } from "@context/db";
import {
  config,
  hackConfig,
  hackReadiness,
  allowedFamilies,
} from "@context/config";
import {
  corporatePreferences,
  corporateRunInput,
  corporateNewsInput,
  corporateAssessment,
  corporateEvidence,
  expertFeedbackInput,
  workRoles,
  corporateContextUpdate,
  type WorkRole,
} from "@context/contracts";
import {
  assertCompanyGrant,
  companyContext,
  companyFieldLabels,
} from "../../../packages/db/src/corporate-context.ts";
import { enqueue, event } from "../../../packages/db/src/jobs.ts";
import { dailyBudget } from "../../../packages/agent/src/hackathon-budget.ts";
import { roleChannels } from "../../../packages/agent/src/corporate-rules.ts";
import {
  digest,
  extractPage,
  canonicalUrl,
} from "../../../packages/agent/src/sources.ts";
import { checkpointer } from "../../../packages/agent/src/graphs.ts";
import { fileStore } from "../../../packages/agent/src/documents.ts";
import { authenticated, access, fail, id, limit } from "./core.ts";
export const corporate = Router();
corporate.use((_req, _res, next) => {
  if (config.APP_VARIANT !== "alfa") fail(404, "NOT_FOUND", "Объект не найден");
  next();
});
export async function companyAccess(
  userId: string,
  companyId: string,
  write = false,
) {
  let grant;
  try {
    grant = await assertCompanyGrant(userId, companyId, write);
  } catch {
    return fail(404, "NOT_FOUND", "Компания недоступна");
  }
  const company = await db.corporateCompany.findUniqueOrThrow({
    where: { id: companyId },
  });
  if (company.orgId && company.scopeId)
    await access(userId, company.orgId, company.scopeId, write);
  return grant;
}
async function admin(userId: string) {
  const grants = await db.companyGrant.findMany({
    where: { userId, canEdit: true },
    select: { companyId: true },
  });
  const company = await db.corporateCompany.findFirst({
    where: { id: { in: grants.map((x) => x.companyId) }, orgId: { not: null } },
  });
  if (!company?.orgId)
    fail(403, "FORBIDDEN", "Нужны права администратора импорта");
  await access(userId, company!.orgId!, undefined, true, true);
  return company!;
}
const key = (req: Request) =>
  z.string().min(8).max(200).parse(req.get("idempotency-key"));
const cursorEncode = (value: unknown) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");
function cursorDecode(value: unknown) {
  try {
    return JSON.parse(
      Buffer.from(z.string().max(2000).parse(value), "base64url").toString(),
    );
  } catch {
    return fail(422, "INVALID_CURSOR", "Некорректный cursor");
  }
}
function timePage(
  req: Request,
  field: "createdAt" | "acceptedAt" = "createdAt",
) {
  const take = z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(30)
    .parse(req.query.limit);
  const cursor = req.query.cursor
    ? z
        .object({ at: z.iso.datetime(), id: z.uuid() })
        .parse(cursorDecode(req.query.cursor))
    : null;
  return {
    take,
    after: cursor
      ? {
          OR: [
            { [field]: { lt: new Date(cursor.at) } },
            { [field]: new Date(cursor.at), id: { lt: cursor.id } },
          ],
        }
      : {},
  };
}
function timeList<T extends { id: string }>(
  rows: T[],
  take: number,
  at: (x: T) => Date,
) {
  const items = rows.slice(0, take),
    last = items.at(-1);
  return {
    items,
    nextCursor:
      rows.length > take && last
        ? cursorEncode({ at: at(last).toISOString(), id: last.id })
        : null,
  };
}
corporate.get("/companies", async (req, res) => {
  const grants = await db.companyGrant.findMany({
    where: { userId: authenticated(req) },
  });
  const memberships = await db.membership.findMany({
    where: { userId: authenticated(req) },
    select: { orgId: true },
  });
  const take = z.coerce
    .number()
    .int()
    .min(1)
    .max(50)
    .default(25)
    .parse(req.query.limit);
  const cursor = req.query.cursor
    ? z.object({ externalId: z.string() }).parse(cursorDecode(req.query.cursor))
    : null;
  const rows = await db.corporateCompany.findMany({
    where: {
      id: { in: grants.map((x) => x.companyId) },
      OR: [{ orgId: null }, { orgId: { in: memberships.map((m) => m.orgId) } }],
      ...(cursor ? { externalId: { gt: cursor.externalId } } : {}),
    },
    orderBy: { externalId: "asc" },
    take: take + 1,
    select: {
      id: true,
      externalId: true,
      name: true,
      groupId: true,
      synthetic: true,
      version: true,
      conflicts: true,
      fields: true,
    },
  });
  const items = rows.slice(0, take).map(({ fields, ...c }) => ({
    ...c,
    industry:
      typeof (fields as Record<string, unknown>).MAINOKVED_NAME === "string"
        ? String((fields as Record<string, unknown>).MAINOKVED_NAME)
        : null,
    grant: grants.find((g) => g.companyId === c.id),
  }));
  res.json({
    items,
    nextCursor:
      rows.length > take
        ? cursorEncode({ externalId: items.at(-1)!.externalId })
        : null,
  });
});
corporate.get("/groups", async (req, res) => {
  const grants = await db.companyGrant.findMany({
    where: { userId: authenticated(req) },
  });
  const memberships = await db.membership.findMany({
    where: { userId: authenticated(req) },
    select: { orgId: true },
  });
  const companies = await db.corporateCompany.findMany({
    where: {
      id: { in: grants.map((x) => x.companyId) },
      OR: [{ orgId: null }, { orgId: { in: memberships.map((m) => m.orgId) } }],
      groupId: { not: null },
    },
    select: {
      id: true,
      name: true,
      groupId: true,
      revenue: true,
      synthetic: true,
      datasetId: true,
    },
  });
  const groups = [...new Set(companies.map((x) => x.groupId!))].map(
    (groupId) => ({
      groupId,
      companies: companies
        .filter((x) => x.groupId === groupId)
        .map((x) => ({ ...x, revenue: x.revenue?.toString() || null })),
      warning:
        "Только разрешённые компании. Сумма исходных выручек не является консолидированной выручкой; единицы CSV могут быть не подтверждены.",
    }),
  );
  res.json({ items: groups, nextCursor: null });
});
corporate.get("/companies/:companyId/context", async (req, res) => {
  const userId = authenticated(req);
  await companyAccess(userId, id(req, "companyId"));
  res.json(await companyContext(id(req, "companyId"), userId));
});
corporate.patch("/companies/:companyId/context", async (req, res) => {
  const userId = authenticated(req),
    companyId = id(req, "companyId");
  await companyAccess(userId, companyId, true);
  const input = corporateContextUpdate.parse(req.body);
  for (const [key, value] of Object.entries(input.fields)) {
    if (
      /^(CL_PRODUCT_.*_MARK|FTS_FLAG|FACTORING_MARK|NEGATIVEMARK)$/.test(key) &&
      !["0.0", "1.0"].includes(value)
    )
      fail(
        422,
        "INVALID_FEATURE_VALUE",
        "Для бинарного признака допустимы 1.0 или 0.0",
      );
    if (key === "REVENUE_COMPANY" && !/^\d+(\.\d{1,6})?$/.test(value))
      fail(
        422,
        "INVALID_FEATURE_VALUE",
        "Выручка — неотрицательное десятичное число в исходных единицах",
      );
  }
  if (Object.keys(input.fields).some((k) => !companyFieldLabels[k]))
    fail(422, "UNKNOWN_FEATURE", "Неизвестный признак");
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${companyId}))`;
    const c = await tx.corporateCompany.findUniqueOrThrow({
      where: { id: companyId },
    });
    if (c.version !== input.expectedVersion)
      fail(409, "VERSION_CONFLICT", "Контекст изменён другим участником");
    const raw = c.fields as Record<string, unknown>,
      previous = (raw._overrides || {}) as Record<string, unknown>;
    const fields = {
      ...raw,
      _overrides: {
        ...previous,
        ...Object.fromEntries(
          Object.entries(input.fields).map(([k, value]) => [
            k,
            {
              value,
              confirmedBy: userId,
              confirmedAt: new Date().toISOString(),
              version: c.version + 1,
            },
          ]),
        ),
      },
    };
    if (c.orgId && c.scopeId) {
      if (
        !(await tx.profileVersion.findFirst({
          where: { orgId: c.orgId, scopeId: c.scopeId, version: c.version },
        }))
      )
        await tx.profileVersion.create({
          data: {
            orgId: c.orgId,
            scopeId: c.scopeId,
            version: c.version,
            fields: c.fields as Prisma.InputJsonValue,
            createdBy: userId,
          },
        });
      await tx.profileVersion.create({
        data: {
          orgId: c.orgId,
          scopeId: c.scopeId,
          version: c.version + 1,
          fields: json(fields),
          createdBy: userId,
        },
      });
    }
    await tx.corporateCompany.update({
      where: { id: companyId },
      data: { fields: json(fields), version: { increment: 1 } },
    });
  });
  res.json(await companyContext(companyId, userId));
});
corporate.get("/companies/:companyId/context/versions", async (req, res) => {
  const companyId = id(req, "companyId");
  await companyAccess(authenticated(req), companyId);
  const c = await db.corporateCompany.findUniqueOrThrow({
    where: { id: companyId },
  });
  res.json({
    items:
      c.scopeId && c.orgId
        ? await db.profileVersion.findMany({
            where: { orgId: c.orgId, scopeId: c.scopeId },
            orderBy: { version: "desc" },
            take: 50,
          })
        : [],
    nextCursor: null,
  });
});
corporate.patch("/companies/:companyId/preferences", async (req, res) => {
  const grant = await companyAccess(authenticated(req), id(req, "companyId"));
  const input = corporatePreferences.parse(req.body);
  res.json(
    await db.companyGrant.update({ where: { id: grant.id }, data: input }),
  );
});
corporate.get("/companies/:companyId/feed", async (req, res) => {
  const companyId = id(req, "companyId"),
    grant = await companyAccess(authenticated(req), companyId);
  const role = z
      .enum(workRoles)
      .default(grant.role as WorkRole)
      .parse(req.query.role),
    roleValues = roleChannels[role] || roleChannels.employee;
  const take = z.coerce
    .number()
    .int()
    .min(1)
    .max(50)
    .default(20)
    .parse(req.query.limit);
  const period = z.coerce
    .number()
    .int()
    .min(1)
    .max(3650)
    .default(30)
    .parse(req.query.days);
  const category = z
    .enum(["all", "risk", "opportunity", "mixed", "background"])
    .default("all")
    .parse(req.query.category);
  const from = new Date(Date.now() - period * 86400000),
    signature = digest(
      JSON.stringify([companyId, role, grant.interests, period, category]),
    );
  const cursor = req.query.cursor
    ? z
        .object({
          score: z.number().int(),
          createdAt: z.iso.datetime(),
          id: z.uuid(),
          signature: z.string(),
        })
        .parse(cursorDecode(req.query.cursor))
    : null;
  if (cursor && cursor.signature !== signature)
    fail(
      422,
      "INVALID_CURSOR",
      "Фильтры изменились; начните с первой страницы",
    );
  type FeedRow = {
    id: string;
    companyId: string;
    runId: string;
    data: Prisma.JsonValue;
    evidence: Prisma.JsonValue;
    createdAt: Date;
    score: number;
    synthetic: boolean;
  };
  const rows = await db.$queryRaw<FeedRow[]>(Prisma.sql`WITH ranked AS (
    SELECT i.*, (i.score + 18*(SELECT count(*) FROM unnest(i.channels) x WHERE x=ANY(${roleValues}::text[])) + 12*(SELECT count(*) FROM unnest(i.channels) x WHERE x=ANY(${grant.interests}::text[])))::int personal_score
    FROM "CorporateInsight" i WHERE i."companyId"=${companyId}::uuid AND i."createdAt">=${from} ${category !== "all" ? Prisma.sql`AND i.data->>'category'=${category}` : Prisma.empty}
  ) SELECT id,"companyId","runId",data,evidence,"createdAt",personal_score score,synthetic FROM ranked
  WHERE true ${cursor ? Prisma.sql`AND (personal_score, "createdAt",id)<(${cursor.score},${new Date(cursor.createdAt)},${cursor.id}::uuid)` : Prisma.empty}
  ORDER BY personal_score DESC,"createdAt" DESC,id DESC LIMIT ${take + 1}`);
  const items = rows.slice(0, take).map((x) => ({
    ...x,
    createdAt: x.createdAt.toISOString(),
    data: corporateAssessment.parse(x.data),
    evidence: z.array(corporateEvidence).parse(x.evidence),
  }));
  const last = items.at(-1);
  res.json({
    items,
    nextCursor:
      rows.length > take && last
        ? cursorEncode({
            score: last.score,
            createdAt: last.createdAt,
            id: last.id,
            signature,
          })
        : null,
    role,
    interests: grant.interests,
  });
});
corporate.get("/companies/:companyId/insights/:insightId", async (req, res) => {
  const companyId = id(req, "companyId");
  await companyAccess(authenticated(req), companyId);
  const insight = await db.corporateInsight.findFirst({
    where: { id: id(req, "insightId"), companyId },
  });
  if (!insight) fail(404, "NOT_FOUND", "Материал не найден");
  res.json(insight);
});
corporate.post("/companies/:companyId/news", async (req, res) => {
  const userId = authenticated(req),
    companyId = id(req, "companyId");
  await companyAccess(userId, companyId, true);
  await limit("corporate-news:" + userId, 30, 600);
  const input = corporateNewsInput.parse(req.body);
  const page = input.url
    ? await extractPage({
        url: canonicalUrl(input.url),
        title: input.title,
        text: "",
        publisher: new URL(input.url).hostname,
        language: "unknown",
        publishedAt: input.publishedAt || null,
        status: "user_url",
      })
    : null;
  const text = page?.text || input.text!;
  if (!text || text.length < 30)
    fail(
      422,
      "SOURCE_UNAVAILABLE",
      "Не удалось прочитать страницу. Добавьте текст и укажите происхождение.",
    );
  const sha256 = digest(text.replace(/\s+/g, " ").trim());
  const news = await db.corporateNews.upsert({
    where: { companyId_sha256: { companyId, sha256 } },
    create: {
      companyId,
      title: input.title,
      text: text.slice(0, 60000),
      url: page?.url || null,
      sha256,
      origin: input.url ? "user_url" : "user_text",
      publishedAt: input.publishedAt
        ? new Date(input.publishedAt)
        : page?.publishedAt
          ? new Date(page.publishedAt)
          : null,
      createdBy: userId,
    },
    update: {},
  });
  res.status(201).json(news);
});
corporate.get("/companies/:companyId/news", async (req, res) => {
  const companyId = id(req, "companyId");
  await companyAccess(authenticated(req), companyId);
  const page = timePage(req);
  const items = await db.corporateNews.findMany({
    where: { companyId, ...page.after },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: page.take + 1,
    omit: { text: true },
  });
  res.json(timeList(items, page.take, (x) => x.createdAt));
});
corporate.post("/companies/:companyId/runs", async (req, res) => {
  const userId = authenticated(req),
    companyId = id(req, "companyId");
  await companyAccess(userId, companyId, true);
  const company = await db.corporateCompany.findUniqueOrThrow({
    where: { id: companyId },
  });
  if (!company.orgId || !company.scopeId)
    fail(
      409,
      "COMPANY_NOT_CONFIGURED",
      "Компания не подключена к рабочему пространству",
    );
  const input = corporateRunInput.parse(req.body);
  if (input.expectedVersion !== company.version)
    fail(409, "VERSION_CONFLICT", "Контекст обновился; перезагрузите страницу");
  if (config.APP_MODE === "live" && !hackReadiness().ready)
    fail(
      503,
      "HACKATHON_NOT_READY",
      "Нужны endpoint, разрешённые model IDs, ключ и тарифы организаторов",
    );
  if (
    input.newsIds.length &&
    (await db.corporateNews.count({
      where: { companyId, id: { in: input.newsIds } },
    })) !== input.newsIds.length
  )
    fail(404, "NOT_FOUND", "Новость недоступна");
  await limit("corporate-run:" + companyId, 6, 600);
  const to = input.to ? new Date(input.to) : new Date(),
    from = input.from
      ? new Date(input.from)
      : new Date(to.getTime() - 30 * 86400000);
  if (from >= to || to.getTime() > Date.now() + 1000)
    fail(422, "INVALID_WINDOW", "Некорректный период");
  res.status(202).json(
    await enqueue({
      orgId: company.orgId!,
      scopeId: company.scopeId!,
      userId,
      kind: "corporate",
      resourceId: companyId,
      from,
      to,
      key: key(req),
      snapshot: {
        context: await companyContext(companyId, userId),
        input,
        requestId: req.requestId,
      },
      payload: input,
    }),
  );
});
corporate.get("/companies/:companyId/runs", async (req, res) => {
  const companyId = id(req, "companyId");
  await companyAccess(authenticated(req), companyId);
  const page = timePage(req, "acceptedAt");
  const company = await db.corporateCompany.findUniqueOrThrow({
    where: { id: companyId },
  });
  const items = await db.insightRun.findMany({
    where: {
      scopeId: company.scopeId || "00000000-0000-4000-8000-000000000000",
      kind: "corporate",
      ...page.after,
    },
    orderBy: [{ acceptedAt: "desc" }, { id: "desc" }],
    take: page.take + 1,
    omit: { snapshot: true },
  });
  res.json(timeList(items, page.take, (x) => x.acceptedAt));
});
corporate.post("/companies/:companyId/runs/:runId/cancel", async (req, res) => {
  const companyId = id(req, "companyId");
  await companyAccess(authenticated(req), companyId, true);
  const company = await db.corporateCompany.findUniqueOrThrow({
      where: { id: companyId },
    }),
    runId = id(req, "runId");
  const run = await db.insightRun.findFirst({
    where: {
      id: runId,
      scopeId: company.scopeId || "00000000-0000-4000-8000-000000000000",
      kind: { in: ["corporate", "corporate_chat", "bank_import"] },
    },
  });
  if (
    !run ||
    (run.kind === "corporate_chat" && run.userId !== authenticated(req))
  )
    fail(404, "NOT_FOUND", "Задание недоступно");
  await db.insightRun.updateMany({
    where: { id: runId, status: { in: ["queued", "running"] } },
    data: { status: "cancel_requested" },
  });
  await checkpointer.deleteThread(runId);
  await event(runId, "progress", { status: "cancel_requested" });
  res.json({ ok: true });
});
corporate.get("/companies/:companyId/runs/:runId/trace", async (req, res) => {
  const companyId = id(req, "companyId");
  await companyAccess(authenticated(req), companyId);
  const company = await db.corporateCompany.findUniqueOrThrow({
      where: { id: companyId },
    }),
    runId = id(req, "runId");
  const run = await db.insightRun.findFirst({
    where: {
      id: runId,
      scopeId: company.scopeId || "00000000-0000-4000-8000-000000000000",
      kind: "corporate",
    },
  });
  if (!run) fail(404, "NOT_FOUND", "Трасса недоступна");
  res.json({
    run: { ...run, snapshot: undefined },
    items: await db.corporateTrace.findMany({
      where: { runId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
  });
});
corporate.get("/companies/:companyId/evidence", async (req, res) => {
  const companyId = id(req, "companyId");
  await companyAccess(authenticated(req), companyId);
  const company = await db.corporateCompany.findUniqueOrThrow({
    where: { id: companyId },
  });
  const kind = z
    .enum(["csv", "news", "calculation", "synthetic"])
    .parse(req.query.kind);
  if (kind === "csv") {
    res.json({
      source: company.datasetId
        ? await db.datasetImport.findUnique({
            where: { id: company.datasetId },
          })
        : null,
      variants: await db.companyVariant.findMany({
        where: { companyId },
        orderBy: { sourceRow: "asc" },
      }),
      conflicts: company.conflicts,
    });
    return;
  }
  if (kind === "news") {
    const news = await db.corporateNews.findFirst({
      where: { id: z.uuid().parse(req.query.sourceId), companyId },
    });
    if (!news) fail(404, "NOT_FOUND", "Источник недоступен");
    res.json(news);
    return;
  }
  res.json({
    companyId,
    context: await companyContext(companyId, authenticated(req)),
    versions: company.scopeId
      ? await db.profileVersion.findMany({
          where: { scopeId: company.scopeId },
          orderBy: { version: "desc" },
        })
      : [],
    formula:
      "share = сумма доступных связей с контрагентом / сумма доступных связей в том же направлении, self-links исключены; не доля всех платежей компании",
    note: "Внешние контрагенты не предоставляют доступа к их карточкам",
  });
});
corporate.get("/companies/:companyId/chats", async (req, res) => {
  const companyId = id(req, "companyId"),
    userId = authenticated(req);
  await companyAccess(userId, companyId);
  const page = timePage(req);
  const items = await db.corporateChat.findMany({
    where: { companyId, userId, ...page.after },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: page.take + 1,
  });
  res.json(timeList(items, page.take, (x) => x.createdAt));
});
corporate.post("/companies/:companyId/chats", async (req, res) => {
  const companyId = id(req, "companyId"),
    userId = authenticated(req),
    grant = await companyAccess(userId, companyId);
  const input = z
    .object({
      question: z.string().trim().min(3).max(6000),
      insightId: z.uuid().optional(),
      role: z.enum(workRoles).default(grant.role as WorkRole),
    })
    .parse(req.body);
  if (config.APP_MODE === "live" && !hackReadiness().ready)
    fail(503, "HACKATHON_NOT_READY", "LLM организаторов не настроена");
  if (
    input.insightId &&
    !(await db.corporateInsight.findFirst({
      where: { id: input.insightId, companyId },
    }))
  )
    fail(404, "NOT_FOUND", "Материал недоступен");
  await limit("corporate-chat:" + userId, 20, 600);
  const company = await db.corporateCompany.findUniqueOrThrow({
      where: { id: companyId },
    }),
    chatId = randomUUID();
  const accepted = await enqueue(
    {
      orgId: company.orgId!,
      scopeId: company.scopeId!,
      userId,
      kind: "corporate_chat",
      resourceId: chatId,
      from: new Date(),
      to: new Date(),
      key: key(req),
      payload: input,
      snapshot: { companyId, role: input.role, requestId: req.requestId },
    },
    async (tx) => {
      await tx.corporateChat.create({
        data: { id: chatId, companyId, userId, ...input },
      });
    },
  );
  await db.corporateChat.updateMany({
    where: { id: accepted.resourceId },
    data: { runId: accepted.jobId },
  });
  res.status(202).json(accepted);
});
corporate.post("/companies/:companyId/feedback", async (req, res) => {
  const companyId = id(req, "companyId"),
    userId = authenticated(req);
  await companyAccess(userId, companyId);
  const input = expertFeedbackInput.parse(req.body);
  if (
    !(await db.corporateInsight.findFirst({
      where: { id: input.insightId, companyId },
    }))
  )
    fail(404, "NOT_FOUND", "Материал недоступен");
  res.status(201).json(
    await db.corporateFeedback.create({
      data: { companyId, userId, ...input },
    }),
  );
});
corporate.get("/companies/:companyId/feedback", async (req, res) => {
  const companyId = id(req, "companyId");
  await companyAccess(authenticated(req), companyId, true);
  const page = timePage(req);
  const items = await db.corporateFeedback.findMany({
    where: { companyId, ...page.after },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: page.take + 1,
  });
  res.json(timeList(items, page.take, (x) => x.createdAt));
});
corporate.patch(
  "/companies/:companyId/feedback/:feedbackId",
  async (req, res) => {
    const companyId = id(req, "companyId"),
      userId = authenticated(req);
    await companyAccess(userId, companyId, true);
    await admin(userId);
    const input = z
      .object({
        expertNote: z.string().min(3).max(5000),
        reviewStatus: z.enum(["reviewed", "open"]),
      })
      .parse(req.body);
    const row = await db.corporateFeedback.updateMany({
      where: { id: id(req, "feedbackId"), companyId },
      data: input,
    });
    if (!row.count) fail(404, "NOT_FOUND", "Отзыв не найден");
    res.json({ ok: true });
  },
);
corporate.get("/integration", async (req, res) => {
  await corpusAccess(authenticated(req));
  res.json({
    mode: config.APP_MODE,
    readiness: hackReadiness(),
    families: allowedFamilies,
    budget: await dailyBudget(),
    modeled: ["Авторизация Альфа-Бизнеса", "Банковская оболочка"],
    missingMaterials: ["Commodities performance"],
    autonomousPaidRuns: false,
  });
});
corporate.get("/imports", async (req, res) => {
  await admin(authenticated(req));
  res.json({
    items: await db.datasetImport.findMany({ orderBy: { createdAt: "asc" } }),
    nextCursor: null,
  });
});
async function corpusAccess(userId: string) {
  const grants = await db.companyGrant.findMany({ where: { userId } });
  const memberships = await db.membership.findMany({
    where: { userId },
    select: { orgId: true },
  });
  if (
    !(await db.corporateCompany.findFirst({
      where: {
        id: { in: grants.map((g) => g.companyId) },
        OR: [
          { orgId: null },
          { orgId: { in: memberships.map((m) => m.orgId) } },
        ],
      },
    }))
  )
    fail(404, "NOT_FOUND", "Корпус недоступен");
}
corporate.get("/materials", async (req, res) => {
  await corpusAccess(authenticated(req));
  res.json({
    items: await db.bankMaterial.findMany({
      orderBy: [{ publishedAt: "desc" }, { id: "asc" }],
      omit: { storageKey: true },
    }),
    nextCursor: null,
    missing: ["Commodities performance"],
  });
});
corporate.get("/materials/:materialId/pages/:page", async (req, res) => {
  await corpusAccess(authenticated(req));
  const row = await db.bankPage.findUnique({
    where: {
      materialId_page: {
        materialId: id(req, "materialId"),
        page: z.coerce.number().int().positive().parse(req.params.page),
      },
    },
  });
  if (!row) fail(404, "NOT_FOUND", "Страница не найдена");
  res.json(row);
});
corporate.get("/materials/:materialId/original", async (req, res) => {
  await corpusAccess(authenticated(req));
  const row = await db.bankMaterial.findUnique({
    where: { id: id(req, "materialId") },
  });
  if (!row) fail(404, "NOT_FOUND", "Материал не найден");
  res.type("application/pdf").setHeader("Content-Disposition", "inline");
  res.send(await fileStore.get(row!.storageKey));
});
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: hackConfig.HACKATHON_FILE_MAX_BYTES, files: 1 },
});
corporate.post(
  "/materials/import",
  async (req, _res, next) => {
    await admin(authenticated(req));
    await limit("bank-import:" + authenticated(req), 3, 600);
    next();
  },
  upload.single("file"),
  async (req, res) => {
    if (!req.file) fail(422, "FILE_REQUIRED", "Выберите PDF");
    const input = z
      .object({
        title: z.string().min(1).max(200),
        publishedAt: z.iso.datetime().optional(),
        dateConfirmed: z.enum(["true", "false"]).default("false"),
      })
      .parse(req.body);
    if (req.file!.buffer.subarray(0, 5).toString() !== "%PDF-")
      fail(422, "BANK_NOT_PDF", "Нужен PDF");
    const userId = authenticated(req),
      company = await admin(userId),
      sha256 = createHash("sha256").update(req.file!.buffer).digest("hex"),
      storageKey = randomUUID();
    await fileStore.put(storageKey, req.file!.buffer);
    const material = await db.bankMaterial.upsert({
      where: { sha256 },
      create: {
        title: input.title,
        filename: path.basename(req.file!.originalname),
        storageKey,
        sha256,
      },
      update: {},
    });
    if (material.storageKey !== storageKey) await fileStore.delete(storageKey);
    res.status(202).json(
      await enqueue({
        orgId: company.orgId!,
        scopeId: company.scopeId!,
        userId,
        kind: "bank_import",
        resourceId: material.id,
        from: new Date(),
        to: new Date(),
        key: key(req),
        payload: { sha256, ...input },
        snapshot: {
          bankImport: { ...input, originalFilename: material.filename },
          requestId: req.requestId,
        },
      }),
    );
  },
);
