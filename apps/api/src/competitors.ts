import { Router } from "express";
import { z } from "zod";
import { db, json } from "@context/db";
import { publicConfig } from "@context/config";
import { competitorInput } from "@context/contracts";
import { enqueue, sha } from "../../../packages/db/src/jobs.ts";
import {
  access,
  authenticated,
  effectiveProfile,
  fail,
  id,
  list,
} from "./core.ts";
export const competitors = Router({ mergeParams: true });
competitors.get("/competitors", async (req, res) => {
  await access(authenticated(req), id(req, "orgId"), id(req, "scopeId"));
  res.json({
    ...list(
      await db.competitor.findMany({
        where: { orgId: id(req, "orgId"), scopeId: id(req, "scopeId") },
        orderBy: { id: "asc" },
      }),
    ),
    activeJobId:
      (
        await db.insightRun.findFirst({
          where: {
            orgId: id(req, "orgId"),
            scopeId: id(req, "scopeId"),
            kind: "competitors",
            status: { in: ["queued", "running"] },
          },
          select: { id: true },
        })
      )?.id || null,
  });
});
competitors.post("/competitors", async (req, res) => {
  const orgId = id(req, "orgId"),
    scopeId = id(req, "scopeId");
  await access(authenticated(req), orgId, scopeId, true);
  const input = competitorInput.parse(req.body);
  res.status(201).json(
    await db.competitor.create({
      data: {
        orgId,
        scopeId,
        identity: (input.domain || input.name).toLowerCase(),
        name: input.name,
        data: json(input),
        decision: input.decision,
        monitoring: input.monitoring,
        fingerprint: sha(input.sources),
        userEdited: true,
      },
    }),
  );
});
competitors.patch("/competitors/:competitorId", async (req, res) => {
  const orgId = id(req, "orgId"),
    scopeId = id(req, "scopeId");
  await access(authenticated(req), orgId, scopeId, true);
  const c = await db.competitor.findFirst({
    where: { id: id(req, "competitorId"), orgId, scopeId },
  });
  if (!c) fail(404, "NOT_FOUND", "Конкурент не найден");
  const input = competitorInput.partial().parse(req.body);
  res.json(
    await db.competitor.update({
      where: { id: c!.id },
      data: {
        name: input.name,
        decision: input.decision,
        monitoring: input.monitoring,
        data: json({ ...(c!.data as object), ...input }),
        revision: { increment: 1 },
        userEdited: true,
      },
    }),
  );
});
competitors.post(
  "/competitor-proposals/:competitorId/decision",
  async (req, res) => {
    const orgId = id(req, "orgId"),
      scopeId = id(req, "scopeId");
    await access(authenticated(req), orgId, scopeId, true);
    const decision = z.enum(["confirmed", "rejected"]).parse(req.body.decision);
    const c = await db.competitor.findFirst({
      where: { id: id(req, "competitorId"), orgId, scopeId },
    });
    if (!c) fail(404, "NOT_FOUND", "Конкурент не найден");
    res.json(
      await db.competitor.update({
        where: { id: c!.id },
        data: {
          decision,
          monitoring: decision === "confirmed" ? "active" : "disabled",
          revision: { increment: 1 },
        },
      }),
    );
  },
);
competitors.post("/competitor-searches", async (req, res) => {
  if (!publicConfig().ready.analysis)
    fail(503, "SEARCH_NOT_READY", "Настройте LLM и поиск на сервере");
  const orgId = id(req, "orgId"),
    scopeId = id(req, "scopeId"),
    userId = authenticated(req);
  await access(userId, orgId, scopeId, true);
  const scope = await db.analysisScope.findUniqueOrThrow({
    where: { id: scopeId },
  });
  res.status(202).json(
    await enqueue({
      orgId,
      scopeId,
      userId,
      kind: "competitors",
      from: new Date(Date.now() - 30 * 86400000),
      to: new Date(),
      snapshot: {
        ...(await effectiveProfile(orgId, scopeId)),
        settings: scope.settings,
      },
      key: z.string().min(8).parse(req.get("idempotency-key")),
      payload: { scopeId },
    }),
  );
});
