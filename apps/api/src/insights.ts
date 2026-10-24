import { Router } from "express";
import { z } from "zod";
import { db, Prisma } from "@context/db";
import {
  access,
  effectiveProfile,
  authenticated,
  fail,
  id,
  list,
  scopeWhere,
} from "./core.ts";
export const insights = Router({ mergeParams: true });
insights.get("/", async (req, res) => {
  const where = await scopeWhere(authenticated(req), id(req, "orgId"));
  const scopeId =
    typeof req.query.scopeId === "string" ? req.query.scopeId : undefined;
  if (scopeId) await access(authenticated(req), id(req, "orgId"), scopeId);
  const filter = z
    .enum(["main", "watch", "verify", "partial"])
    .default("main")
    .parse(req.query.filter);
  const limit = z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .parse(req.query.limit);
  const conditions = [
    Prisma.sql`i."orgId"=${where.orgId}::uuid`,
    Prisma.sql`i.lifecycle IN ('active','disputed')`,
  ];
  if (scopeId)
    conditions.push(Prisma.sql`i."scopeId"=${z.uuid().parse(scopeId)}::uuid`);
  if (where.scopeId)
    conditions.push(
      where.scopeId.in.length
        ? Prisma.sql`i."scopeId" IN (${Prisma.join(where.scopeId.in.map((s) => Prisma.sql`${s}::uuid`))})`
        : Prisma.sql`FALSE`,
    );
  conditions.push(
    filter === "verify"
      ? Prisma.sql`i."potentialSeverity" IS NOT NULL`
      : filter === "watch"
        ? Prisma.sql`i.severity='medium' AND i."potentialSeverity" IS NULL`
        : Prisma.sql`i.severity IN ('critical','high') AND i."potentialSeverity" IS NULL`,
  );
  if (filter !== "partial") conditions.push(Prisma.sql`r.status='succeeded'`);
  if (req.query.cursor) {
    try {
      const c = z
        .object({
          severity: z.string(),
          updatedAt: z.iso.datetime(),
          id: z.uuid(),
          filter: z.string(),
          scope: z.string(),
        })
        .parse(
          JSON.parse(
            Buffer.from(String(req.query.cursor), "base64url").toString(),
          ),
        );
      if (c.filter !== filter || c.scope !== (scopeId || ""))
        fail(422, "INVALID_CURSOR", "Курсор относится к другому фильтру");
      conditions.push(
        Prisma.sql`(i.severity>${c.severity} OR (i.severity=${c.severity} AND (i."updatedAt"<${new Date(c.updatedAt)} OR (i."updatedAt"=${new Date(c.updatedAt)} AND i.id<${c.id}::uuid))))`,
      );
    } catch {
      fail(422, "INVALID_CURSOR", "Некорректный курсор");
    }
  }
  const fetched = await db.$queryRaw<
    Prisma.InsightGetPayload<Record<string, never>>[]
  >(
    Prisma.sql`SELECT i.* FROM "Insight" i JOIN "InsightRevision" v ON v.id=i."latestRevisionId" JOIN "InsightRun" r ON r.id=v."runId" WHERE ${Prisma.join(conditions, " AND ")} ORDER BY i.severity ASC,i."updatedAt" DESC,i.id DESC LIMIT ${limit + 1}`,
  );
  const rows = fetched.slice(0, limit);
  const readStates = await db.readState.findMany({
    where: {
      userId: authenticated(req),
      insightId: { in: rows.map((r) => r.id) },
    },
  });
  const revisions = await db.insightRevision.findMany({
    where: {
      id: {
        in: rows.flatMap((r) =>
          r.latestRevisionId ? [r.latestRevisionId] : [],
        ),
      },
    },
  });
  const revisionById = new Map(revisions.map((r) => [r.id, r])),
    readById = new Map(readStates.map((r) => [r.insightId, r.at]));
  const items = rows.map((row) => ({
    ...row,
    revision: revisionById.get(row.latestRevisionId!),
    unread: !readById.has(row.id) || readById.get(row.id)! < row.updatedAt,
  }));
  const last = rows.at(-1);
  res.json({
    items,
    nextCursor:
      fetched.length > limit && last
        ? Buffer.from(
            JSON.stringify({
              severity: last.severity,
              updatedAt: last.updatedAt,
              id: last.id,
              filter,
              scope: scopeId || "",
            }),
          ).toString("base64url")
        : null,
  });
});
insights.get("/:insightId", async (req, res) => {
  const row = await getInsight(
    authenticated(req),
    id(req, "orgId"),
    id(req, "insightId"),
  );
  const revision = await db.insightRevision.findUniqueOrThrow({
    where: { id: row.latestRevisionId! },
  });
  const current = await effectiveProfile(row.orgId, row.scopeId);
  res.json({
    ...row,
    revision,
    contextChanged: current.profileVersionId !== revision.profileVersionId,
  });
});
insights.get("/:insightId/revisions", async (req, res) => {
  await getInsight(authenticated(req), id(req, "orgId"), id(req, "insightId"));
  res.json(
    list(
      await db.insightRevision.findMany({
        where: { insightId: id(req, "insightId") },
        orderBy: { createdAt: "desc" },
      }),
    ),
  );
});
insights.patch("/:insightId/work-status", async (req, res) => {
  const row = await getInsight(
    authenticated(req),
    id(req, "orgId"),
    id(req, "insightId"),
  );
  await access(authenticated(req), row.orgId, row.scopeId, true);
  res.json(
    await db.insight.update({
      where: { id: row.id },
      data: {
        workStatus: z
          .enum(["open", "in_progress", "resolved", "dismissed"])
          .parse(req.body.status),
      },
    }),
  );
});
insights.post("/:insightId/read", async (req, res) => {
  const row = await getInsight(
    authenticated(req),
    id(req, "orgId"),
    id(req, "insightId"),
  );
  res.json(
    await db.readState.upsert({
      where: {
        userId_insightId: { userId: authenticated(req), insightId: row.id },
      },
      create: { userId: authenticated(req), insightId: row.id },
      update: { at: new Date() },
    }),
  );
});
insights.post("/:insightId/feedback", async (req, res) => {
  const row = await getInsight(
    authenticated(req),
    id(req, "orgId"),
    id(req, "insightId"),
  );
  res.status(201).json(
    await db.feedback.create({
      data: {
        insightId: row.id,
        userId: authenticated(req),
        ...z
          .object({
            useful: z.boolean(),
            comment: z.string().max(2000).optional(),
          })
          .parse(req.body),
      },
    }),
  );
});
export async function getInsight(
  userId: string,
  orgId: string,
  insightId: string,
) {
  const row = await db.insight.findFirst({ where: { id: insightId, orgId } });
  if (!row) fail(404, "NOT_FOUND", "Инсайт не найден");
  await access(userId, orgId, row!.scopeId);
  return row!;
}
export const evidence = Router({ mergeParams: true });
evidence.get("/:sourceId", async (req, res) => {
  const orgId = id(req, "orgId"),
    userId = authenticated(req),
    sourceId = id(req, "sourceId");
  const where = await scopeWhere(userId, orgId);
  const found = await db.insightRevision.findFirst({
    where: { ...where, evidence: { array_contains: [{ sourceId }] } },
    select: { id: true },
  });
  if (!found) fail(404, "NOT_FOUND", "Источник не найден");
  const source = await db.sourceDocument.findUnique({
    where: { id: sourceId },
  });
  if (!source) fail(404, "NOT_FOUND", "Источник не найден");
  res.json({ ...source, text: source!.text.slice(0, 1200) });
});
