import { Router } from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db, json } from "@context/db";
import { config } from "@context/config";
import {
  fileStore,
  validateFile,
} from "../../../packages/agent/src/documents.ts";
import { enqueue } from "../../../packages/db/src/jobs.ts";
import {
  access,
  authenticated,
  effectiveProfile,
  fail,
  hash,
  id,
  list,
  pagination,
} from "./core.ts";
export const documents = Router({ mergeParams: true });
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.FILE_MAX_BYTES, files: 1, fields: 2 },
});
async function documentAccess(
  userId: string,
  orgId: string,
  documentId: string,
  write = false,
) {
  const doc = await db.document.findFirst({ where: { id: documentId, orgId } });
  if (!doc) fail(404, "NOT_FOUND", "Документ не найден");
  await access(userId, orgId, doc!.scopeId, write, write && !doc!.scopeId);
  return doc!;
}
documents.get("/", async (req, res) => {
  const orgId = id(req, "orgId"),
    m = await access(authenticated(req), orgId);
  const restricted = !m.allScopes && !["owner", "admin"].includes(m.role);
  res.json(
    list(
      await db.document.findMany({
        where: {
          orgId,
          ...(restricted
            ? { OR: [{ scopeId: null }, { scopeId: { in: m.scopeIds } }] }
            : {}),
        },
        ...pagination(req),
        orderBy: { id: "desc" },
        omit: { storageKey: true },
      }),
    ),
  );
});
documents.post("/", upload.single("file"), async (req, res) => {
  if (
    config.APP_MODE === "live" &&
    (!config.LLM_API_KEY || !config.LLM_MODEL_ID)
  )
    fail(503, "LLM_NOT_READY", "Модель извлечения контекста не настроена");
  const userId = authenticated(req),
    orgId = id(req, "orgId"),
    scopeId = req.body.scopeId ? z.uuid().parse(req.body.scopeId) : null;
  await access(userId, orgId, scopeId, true, !scopeId);
  if (!req.file) fail(422, "FILE_REQUIRED", "Выберите файл");
  const f = req.file!,
    extension = f.originalname.split(".").at(-1)!.toLowerCase();
  try {
    await validateFile(f.buffer, extension, f.mimetype);
  } catch {
    fail(422, "INVALID_FILE", "Неподдерживаемый или небезопасный файл");
  }
  const docId = randomUUID();
  const key = z.string().min(8).max(200).parse(req.get("idempotency-key"));
  const effectiveScope =
    scopeId ||
    (
      await db.analysisScope.findFirstOrThrow({
        where: { orgId, isDefault: true },
      })
    ).id;
  await fileStore.put(docId, f.buffer);
  try {
    const accepted = await enqueue(
      {
        orgId,
        scopeId: effectiveScope,
        userId,
        kind: "document",
        resourceId: docId,
        from: new Date(),
        to: new Date(),
        snapshot: await effectiveProfile(orgId, effectiveScope),
        key,
        payload: { scopeId, name: f.originalname, checksum: hash(f.buffer) },
      },
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${orgId}))`;
        const used = await tx.document.aggregate({
          where: { orgId, status: { not: "deleted" } },
          _count: true,
          _sum: { size: true },
        });
        if (
          used._count >= config.FILE_MAX_COUNT ||
          (used._sum.size || 0) + f.size > config.FILE_TOTAL_BYTES
        )
          fail(422, "STORAGE_LIMIT", "Превышен лимит документов организации");
        await tx.document.create({
          data: {
            id: docId,
            orgId,
            scopeId,
            name: f.originalname.slice(0, 240),
            extension,
            size: f.size,
            hash: hash(f.buffer),
            storageKey: docId,
            createdBy: userId,
          },
        });
      },
    );
    if (accepted.reused) await fileStore.delete(docId);
    res.status(202).json({ ...accepted, documentId: accepted.resourceId });
  } catch (error) {
    await fileStore.delete(docId);
    throw error;
  }
});
documents.get("/:documentId", async (req, res) => {
  const doc = await documentAccess(
    authenticated(req),
    id(req, "orgId"),
    id(req, "documentId"),
  );
  res.json({ ...doc, storageKey: undefined });
});
documents.get("/:documentId/chunks", async (req, res) => {
  const doc = await documentAccess(
    authenticated(req),
    id(req, "orgId"),
    id(req, "documentId"),
  );
  res.json(
    list(
      doc.status === "deleted"
        ? []
        : await db.documentChunk.findMany({
            where: { documentId: doc.id },
            ...pagination(req),
            orderBy: { id: "asc" },
          }),
    ),
  );
});
documents.get("/:documentId/download", async (req, res) => {
  const doc = await documentAccess(
    authenticated(req),
    id(req, "orgId"),
    id(req, "documentId"),
  );
  if (doc.status === "deleted") fail(410, "DELETED", "Документ удалён");
  res.setHeader(
    "Content-Type",
    doc.extension === "pdf" ? "application/pdf" : "application/octet-stream",
  );
  res.setHeader(
    "Content-Disposition",
    `attachment; filename*=UTF-8''${encodeURIComponent(doc.name)}`,
  );
  res.send(await fileStore.get(doc.storageKey));
});
documents.post("/:documentId/retry", async (req, res) => {
  const userId = authenticated(req),
    orgId = id(req, "orgId"),
    doc = await documentAccess(userId, orgId, id(req, "documentId"), true);
  if (doc.status === "deleted") fail(410, "DELETED", "Документ удалён");
  const scopeId =
    doc.scopeId ||
    (
      await db.analysisScope.findFirstOrThrow({
        where: { orgId, isDefault: true },
      })
    ).id;
  res.status(202).json(
    await enqueue({
      orgId,
      scopeId,
      userId,
      kind: "document",
      resourceId: doc.id,
      from: new Date(),
      to: new Date(),
      snapshot: await effectiveProfile(orgId, scopeId),
      key: z.string().min(8).parse(req.get("idempotency-key")),
      payload: { documentId: doc.id },
    }),
  );
});
documents.delete("/:documentId", async (req, res) => {
  const doc = await documentAccess(
    authenticated(req),
    id(req, "orgId"),
    id(req, "documentId"),
    true,
  );
  await db.$transaction(async (tx) => {
    await tx.document.update({
      where: { id: doc.id },
      data: { status: "deleted" },
    });
    await tx.documentChunk.deleteMany({ where: { documentId: doc.id } });
    await tx.profileProposal.updateMany({
      where: { documentId: doc.id, status: "proposed" },
      data: { status: "source_deleted" },
    });
    await tx.insightRun.updateMany({
      where: {
        orgId: doc.orgId,
        ...(doc.scopeId ? { scopeId: doc.scopeId } : {}),
        status: { in: ["queued", "running"] },
      },
      data: { status: "cancel_requested" },
    });
    await tx.auditRecord.create({
      data: {
        orgId: doc.orgId,
        userId: authenticated(req),
        action: "document.deleted",
        metadata: json({ documentId: doc.id }),
      },
    });
  });
  await fileStore.delete(doc.storageKey);
  const threads = await db.insightRun.findMany({
    where: { orgId: doc.orgId },
    select: { id: true },
  });
  const { checkpointer } = await import(
    "../../../packages/agent/src/graphs.ts"
  );
  for (const t of threads) await checkpointer.deleteThread(t.id);
  res.json({ ok: true });
});
