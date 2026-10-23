import { db, json, type Tx } from "./index.ts";
import { createHash } from "node:crypto";
export const sha = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export async function enqueue(
  input: {
    orgId: string;
    scopeId: string;
    userId: string;
    kind: string;
    resourceId?: string;
    mode?: string;
    from: Date;
    to: Date;
    cursorVersion?: number;
    snapshot: unknown;
    key: string;
    payload: unknown;
  },
  prepare?: (tx: Tx) => Promise<void>,
) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.scopeId}))`;
    const key = sha([
        input.userId,
        input.orgId,
        input.scopeId,
        input.kind,
        input.key,
      ]),
      payloadHash = sha(input.payload);
    const existing = await tx.idempotency.findUnique({ where: { id: key } });
    if (existing) {
      if (existing.payloadHash !== payloadHash)
        throw new Error("IDEMPOTENCY_CONFLICT");
      const run = await tx.insightRun.findUniqueOrThrow({
        where: { id: existing.resourceId },
      });
      return {
        jobId: run.id,
        resourceId: run.resourceId || run.id,
        status: run.status,
        reused: true,
      };
    }
    const active = await tx.insightRun.findFirst({
      where: {
        scopeId: input.scopeId,
        kind: input.kind,
        ...(input.resourceId ? { resourceId: input.resourceId } : {}),
        status: { in: ["queued", "running", "cancel_requested"] },
      },
    });
    if (active) {
      await tx.idempotency.create({
        data: {
          id: key,
          userId: input.userId,
          payloadHash,
          resourceId: active.id,
        },
      });
      return {
        jobId: active.id,
        resourceId: active.resourceId || active.id,
        status: active.status,
        reused: true,
      };
    }
    if (input.kind === "analysis" && (input.mode || "normal") === "normal") {
      const scope = await tx.analysisScope.findUniqueOrThrow({
        where: { id: input.scopeId },
      });
      input.from = scope.cursorAt || input.from;
      input.cursorVersion = scope.cursorVersion;
      if (input.from >= input.to) throw new Error("IDEMPOTENCY_CONFLICT");
    }
    if (prepare) await prepare(tx);
    const run = await tx.insightRun.create({
      data: {
        orgId: input.orgId,
        scopeId: input.scopeId,
        userId: input.userId,
        kind: input.kind,
        resourceId: input.resourceId,
        mode: input.mode || "normal",
        acceptedAt:
          input.kind === "analysis" && (input.mode || "normal") === "normal"
            ? input.to
            : new Date(),
        windowFrom: input.from,
        windowTo: input.to,
        cursorVersion: input.cursorVersion || 0,
        snapshot: json(input.snapshot),
      },
    });
    if (input.kind === "chat") {
      const chat = input.snapshot as { question: string; assistantId: string };
      await tx.chatMessage.create({
        data: {
          threadId: input.resourceId!,
          userId: input.userId,
          role: "user",
          content: chat.question,
        },
      });
      await tx.chatMessage.create({
        data: {
          id: chat.assistantId,
          threadId: input.resourceId!,
          role: "assistant",
          content: "",
          status: "pending",
        },
      });
    }
    await tx.outbox.create({ data: { id: run.id } });
    await tx.idempotency.create({
      data: { id: key, userId: input.userId, payloadHash, resourceId: run.id },
    });
    await tx.runEvent.create({
      data: {
        runId: run.id,
        type: "snapshot",
        data: json({ status: "queued" }),
      },
    });
    return {
      jobId: run.id,
      resourceId: input.resourceId || run.id,
      status: run.status,
      reused: false,
    };
  });
}
export async function event(runId: string, type: string, data: unknown) {
  return db.runEvent.create({ data: { runId, type, data: json(data) } });
}
