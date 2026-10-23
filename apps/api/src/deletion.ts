import { Router } from "express";
import { db } from "@context/db";
import { access, authenticated, fail, id } from "./core.ts";
import { fileStore } from "../../../packages/agent/src/documents.ts";
import { checkpointer } from "../../../packages/agent/src/graphs.ts";
export const deletion = Router();
deletion.delete("/:orgId", async (req, res) => {
  const orgId = id(req, "orgId"),
    m = await access(authenticated(req), orgId);
  if (m.role !== "owner")
    fail(403, "FORBIDDEN", "Удалить организацию может только владелец");
  const org = await db.organization.findUniqueOrThrow({ where: { id: orgId } });
  if (req.body.confirmName !== org.name)
    fail(422, "CONFIRM_NAME", "Введите название организации для подтверждения");
  const docs = await db.document.findMany({ where: { orgId } }),
    runs = await db.insightRun.findMany({ where: { orgId } }),
    threads = await db.chatThread.findMany({ where: { orgId } }),
    insights = await db.insight.findMany({ where: { orgId } });
  await db.$transaction([
    db.insightRun.updateMany({
      where: { orgId, status: { in: ["queued", "running"] } },
      data: { status: "cancel_requested" },
    }),
    db.document.updateMany({ where: { orgId }, data: { status: "deleted" } }),
    db.documentChunk.deleteMany({ where: { orgId } }),
  ]);
  for (const doc of docs) await fileStore.delete(doc.storageKey);
  for (const run of runs) await checkpointer.deleteThread(run.id);
  await db.$transaction(async (tx) => {
    const runIds = runs.map((r) => r.id),
      threadIds = threads.map((r) => r.id),
      insightIds = insights.map((r) => r.id);
    await tx.runEvent.deleteMany({ where: { runId: { in: runIds } } });
    await tx.outbox.deleteMany({ where: { id: { in: runIds } } });
    await tx.usageRecord.deleteMany({ where: { runId: { in: runIds } } });
    await tx.idempotency.deleteMany({ where: { resourceId: { in: runIds } } });
    await tx.feedback.deleteMany({ where: { insightId: { in: insightIds } } });
    await tx.readState.deleteMany({ where: { insightId: { in: insightIds } } });
    await tx.chatMessage.deleteMany({ where: { threadId: { in: threadIds } } });
    await tx.decision.deleteMany({ where: { orgId } });
    await tx.chatThread.deleteMany({ where: { orgId } });
    await tx.insightRevision.deleteMany({ where: { orgId } });
    await tx.insight.deleteMany({ where: { orgId } });
    await tx.insightRun.deleteMany({ where: { orgId } });
    await tx.competitor.deleteMany({ where: { orgId } });
    await tx.profileProposal.deleteMany({ where: { orgId } });
    await tx.profileVersion.deleteMany({ where: { orgId } });
    await tx.document.deleteMany({ where: { orgId } });
    await tx.invitation.deleteMany({ where: { orgId } });
    await tx.auditRecord.deleteMany({ where: { orgId } });
    await tx.organization.delete({ where: { id: orgId } });
  });
  res.json({ ok: true });
});
