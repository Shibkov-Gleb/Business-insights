import { Router } from "express";
import { z } from "zod";
import { db, json } from "@context/db";
import { publicConfig } from "@context/config";
import { runInput } from "@context/contracts";
import { enqueue, event, sha } from "../../../packages/db/src/jobs.ts";
import { companyAccess } from "./corporate.ts";
import {
  access,
  authenticated,
  effectiveProfile,
  fail,
  id,
  limit,
  list,
  pagination,
} from "./core.ts";
export const runs = Router({ mergeParams: true });
runs.post("/", async (req, res) => {
  const userId = authenticated(req),
    orgId = id(req, "orgId"),
    scopeId = id(req, "scopeId");
  await access(userId, orgId, scopeId, true);
  if (!publicConfig().ready.analysis)
    fail(503, "ANALYSIS_NOT_READY", "Настройте LLM и поиск на сервере");
  const input = runInput.parse(req.body),
    key = z.string().min(8).max(200).parse(req.get("idempotency-key"));
  const to = new Date(),
    scope = await db.analysisScope.findUniqueOrThrow({
      where: { id: scopeId },
    });
  const repeated = await db.idempotency.findUnique({
    where: { id: sha([userId, orgId, scopeId, "analysis", key]) },
  });
  if (
    input.mode === "normal" &&
    input.initialFrom &&
    scope.cursorAt &&
    !repeated
  )
    fail(
      422,
      "CURSOR_EXISTS",
      "Начальная дата доступна только до первого анализа",
    );
  const from =
    input.mode === "historical_rescan"
      ? new Date(input.from)
      : scope.cursorAt ||
        new Date(input.initialFrom || to.getTime() - 30 * 86400000);
  const end = input.mode === "historical_rescan" ? new Date(input.to) : to;
  if (from >= end || end > to)
    fail(422, "INVALID_WINDOW", "Некорректный период");
  const active = await db.insightRun.findFirst({
    where: {
      scopeId,
      kind: "analysis",
      status: { in: ["queued", "running", "cancel_requested"] },
    },
  });
  if (!active) await limit("analysis:" + scopeId, 3, 600);
  const snapshot = await effectiveProfile(orgId, scopeId);
  res.status(202).json(
    await enqueue({
      orgId,
      scopeId,
      userId,
      kind: "analysis",
      mode: input.mode,
      from,
      to: end,
      cursorVersion: scope.cursorVersion,
      snapshot: { ...snapshot, settings: scope.settings },
      key,
      payload: input,
    }),
  );
});
runs.get("/", async (req, res) => {
  await access(authenticated(req), id(req, "orgId"), id(req, "scopeId"));
  res.json(
    list(
      await db.insightRun.findMany({
        where: {
          orgId: id(req, "orgId"),
          scopeId: id(req, "scopeId"),
          kind: "analysis",
        },
        ...pagination(req),
        orderBy: [{ acceptedAt: "desc" }, { id: "desc" }],
        omit: { snapshot: true },
      }),
    ),
  );
});
runs.get("/:runId", async (req, res) => {
  const run = await authorizedJob(authenticated(req), id(req, "runId"));
  if (run.orgId !== id(req, "orgId") || run.scopeId !== id(req, "scopeId"))
    fail(404, "NOT_FOUND", "Запуск не найден");
  res.json({ ...run, snapshot: undefined });
});
runs.get("/:runId/previews", async (req, res) => {
  const run = await authorizedJob(authenticated(req), id(req, "runId"));
  if (run.orgId !== id(req, "orgId") || run.scopeId !== id(req, "scopeId"))
    fail(404, "NOT_FOUND", "Запуск не найден");
  res.json(
    list(
      await db.insightRevision.findMany({
        where: { runId: run.id },
        ...pagination(req),
        orderBy: { id: "desc" },
      }),
    ),
  );
});
runs.post("/:runId/cancel", async (req, res) => {
  const run = await authorizedJob(authenticated(req), id(req, "runId"));
  await access(authenticated(req), id(req, "orgId"), id(req, "scopeId"), true);
  if (run.orgId !== id(req, "orgId") || run.scopeId !== id(req, "scopeId"))
    fail(404, "NOT_FOUND", "Запуск не найден");
  await db.insightRun.updateMany({
    where: { id: run.id, status: { in: ["queued", "running"] } },
    data: { status: "cancel_requested" },
  });
  await event(run.id, "progress", { status: "cancel_requested" });
  res.json({ ok: true });
});
runs.post("/:runId/accept-partial", async (req, res) => {
  const userId = authenticated(req),
    orgId = id(req, "orgId"),
    scopeId = id(req, "scopeId");
  await access(userId, orgId, scopeId, true);
  const result = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${scopeId}))`;
    const run = await tx.insightRun.findFirst({
      where: { id: id(req, "runId"), orgId, scopeId, status: "partial" },
    });
    if (!run) fail(409, "NOT_PARTIAL", "Нет частичного результата");
    const c = run!.coverage as any;
    if (!c.acceptable || req.body.confirm !== true)
      fail(422, "CANNOT_ACCEPT", "Этот результат нельзя принять");
    if (run!.mode === "normal") {
      const update = await tx.analysisScope.updateMany({
        where: { id: scopeId, cursorVersion: run!.cursorVersion },
        data: { cursorAt: run!.windowTo, cursorVersion: { increment: 1 } },
      });
      if (!update.count) fail(409, "CURSOR_CONFLICT", "Период уже изменён");
    }
    const revisions = await tx.insightRevision.findMany({
      where: { runId: run!.id },
    });
    for (const revision of revisions)
      await tx.insight.update({
        where: { id: revision.insightId },
        data: {
          latestRevisionId: revision.id,
          title: (revision.data as any).title,
          confidence: (revision.data as any).confidence,
          lifecycle:
            (revision.data as any).conflicts ||
            (revision.data as any).correctsPrevious
              ? "disputed"
              : "active",
        },
      });
    const r = await tx.insightRun.update({
      where: { id: run!.id },
      data: {
        status: "succeeded",
        finishedAt: new Date(),
        coverage: json({ ...c, acceptedGaps: c.gaps, acceptedBy: userId }),
      },
    });
    await tx.auditRecord.create({
      data: {
        orgId,
        userId,
        action: "run.acceptedGaps",
        metadata: json({ runId: r.id, gaps: c.gaps }),
      },
    });
    return r;
  });
  await event(result.id, "completed", { status: "succeeded" });
  res.json({ ...result, snapshot: undefined });
});
export async function authorizedJob(userId: string, jobId: string) {
  const run = await db.insightRun.findUnique({ where: { id: jobId } });
  if (!run) fail(404, "NOT_FOUND", "Задание не найдено");
  await access(userId, run!.orgId, run!.scopeId);
  if (run!.kind.startsWith("corporate")) {
    const company = await db.corporateCompany.findUnique({ where: { scopeId: run!.scopeId } });
    if (!company) fail(404, "NOT_FOUND", "Задание недоступно");
    await companyAccess(userId, company!.id);
    if (run!.kind === "corporate_chat" && run!.userId !== userId) fail(404, "NOT_FOUND", "Диалог приватен");
  }
  if (run!.kind === "chat") {
    const chat = await db.chatThread.findUnique({
      where: { id: run!.resourceId! },
    });
    if (!chat || (chat.visibility === "private" && chat.userId !== userId))
      fail(404, "NOT_FOUND", "Задание не найдено");
  }
  return run!;
}
export const jobs = Router();
jobs.get("/:jobId", async (req, res) => {
  const r = await authorizedJob(authenticated(req), id(req, "jobId"));
  res.json({ ...r, snapshot: undefined });
});
jobs.get("/:jobId/events", async (req, res) => {
  const userId = authenticated(req),
    jobId = id(req, "jobId");
  await authorizedJob(userId, jobId);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  let last = BigInt(
    /^\d+$/.test(req.get("last-event-id") || "")
      ? req.get("last-event-id")!
      : "0",
  );
  let stopped = false;
  req.on("close", () => {
    stopped = true;
  });
  while (!stopped) {
    try {
      const session = await db.session.findUnique({
        where: { id: req.sessionId! },
      });
      if (!session || session.expiresAt < new Date()) break;
      const run = await authorizedJob(userId, jobId);
      const rows = await db.runEvent.findMany({
        where: { runId: jobId, id: { gt: last } },
        orderBy: { id: "asc" },
        take: 100,
      });
      for (const row of rows) {
        res.write(
          `id: ${row.id}\nevent: ${row.type}\ndata: ${JSON.stringify(row.data)}\n\n`,
        );
        last = row.id;
      }
      if (!rows.length)
        res.write(
          `event: snapshot\ndata: ${JSON.stringify({ status: run.status })}\n\n`,
        );
      if (
        ["succeeded", "failed", "cancelled", "partial"].includes(run.status) &&
        rows.length < 100
      )
        break;
      res.write(": heartbeat\n\n");
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch {
      break;
    }
  }
  res.end();
});
