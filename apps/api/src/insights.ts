import { Router } from "express";
import { z } from "zod";
import { db } from "@context/db";
import {
  access,
  effectiveProfile,
  authenticated,
  fail,
  id,
  list,
  pagination,
  scopeWhere,
} from "./core.ts";
export const insights = Router({ mergeParams: true });
insights.get("/", async (req, res) => {
  const where = await scopeWhere(authenticated(req), id(req, "orgId"));
  const scopeId =
    typeof req.query.scopeId === "string" ? req.query.scopeId : undefined;
  if (scopeId) await access(authenticated(req), id(req, "orgId"), scopeId);
  const rows = await db.insight.findMany({
    where: {
      ...where,
      latestRevisionId: { not: null },
      ...(scopeId ? { scopeId } : {}),
      ...(req.query.filter === "watch"
        ? { severity: "medium", potentialSeverity: null }
        : req.query.filter === "verify"
          ? { potentialSeverity: { not: null } }
          : {
              severity: { in: ["critical", "high"] },
              potentialSeverity: null,
            }),
      lifecycle: { in: ["active", "disputed"] },
    },
    ...pagination(req),
    orderBy: [{ severity: "asc" }, { updatedAt: "desc" }, { id: "desc" }],
  });
  const readStates = await db.readState.findMany({
    where: {
      userId: authenticated(req),
      insightId: { in: rows.map((r) => r.id) },
    },
  });
  const enriched = [];
  for (const row of rows) {
    if (!row.latestRevisionId) continue;
    const revision = await db.insightRevision.findUnique({
      where: { id: row.latestRevisionId! },
    });
    const run = revision
      ? await db.insightRun.findUnique({ where: { id: revision.runId } })
      : null;
    if (run?.status === "succeeded" || req.query.filter === "partial")
      enriched.push({
        ...row,
        revision,
        unread: !readStates.some(
          (r) => r.insightId === row.id && r.at >= row.updatedAt,
        ),
      });
  }
  res.json(list(enriched));
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
  const revisions = await db.insightRevision.findMany({ where });
  let found = false;
  for (const r of revisions)
    if ((r.evidence as any[]).some((e) => e.sourceId === sourceId))
      found = true;
  if (!found) fail(404, "NOT_FOUND", "Источник не найден");
  const source = await db.sourceDocument.findUnique({
    where: { id: sourceId },
  });
  if (!source) fail(404, "NOT_FOUND", "Источник не найден");
  res.json({ ...source, text: source!.text.slice(0, 1200) });
});
