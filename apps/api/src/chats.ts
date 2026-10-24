import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@context/db";
import { config } from "@context/config";
import { enqueue } from "../../../packages/db/src/jobs.ts";
import {
  access,
  authenticated,
  audit,
  effectiveProfile,
  fail,
  id,
  limit,
  list,
  scopeWhere,
} from "./core.ts";
import { getInsight } from "./insights.ts";
export const chats = Router({ mergeParams: true });
async function chatAccess(userId: string, orgId: string, chatId: string) {
  const c = await db.chatThread.findFirst({ where: { id: chatId, orgId } });
  if (!c || (c.visibility === "private" && c.userId !== userId))
    fail(404, "NOT_FOUND", "Чат не найден");
  await access(userId, orgId, c!.scopeId);
  return c!;
}
chats.get("/", async (req, res) => {
  const userId = authenticated(req),
    orgId = id(req, "orgId");
  res.json(
    list(
      await db.chatThread.findMany({
        where: {
          ...(await scopeWhere(userId, orgId)),
          OR: [{ userId }, { visibility: "shared" }],
        },
        orderBy: { createdAt: "desc" },
      }),
    ),
  );
});
chats.post("/", async (req, res) => {
  const userId = authenticated(req),
    orgId = id(req, "orgId"),
    input = z
      .object({
        scopeId: z.uuid(),
        insightId: z.uuid().optional(),
        title: z.string().min(1).max(200).default("Новый разговор"),
      })
      .parse(req.body);
  await access(userId, orgId, input.scopeId);
  if (input.insightId) {
    const insight = await getInsight(userId, orgId, input.insightId);
    if (insight.scopeId !== input.scopeId)
      fail(422, "SCOPE_MISMATCH", "Выберите направление инсайда");
  }
  res
    .status(201)
    .json(await db.chatThread.create({ data: { ...input, userId, orgId } }));
});
chats.get("/:chatId", async (req, res) => {
  const c = await chatAccess(
    authenticated(req),
    id(req, "orgId"),
    id(req, "chatId"),
  );
  res.json({
    ...c,
    activeJobId:
      (
        await db.insightRun.findFirst({
          where: {
            orgId: c.orgId,
            scopeId: c.scopeId,
            resourceId: c.id,
            kind: "chat",
            status: { in: ["queued", "running", "cancel_requested"] },
          },
          select: { id: true },
        })
      )?.id || null,
    messages: await db.chatMessage.findMany({
      where: { threadId: c.id },
      orderBy: { createdAt: "asc" },
    }),
  });
});
chats.post("/:chatId/messages", async (req, res) => {
  if (
    config.APP_MODE === "live" &&
    (!config.LLM_API_KEY || !config.LLM_MODEL_ID)
  )
    fail(503, "LLM_NOT_READY", "Модель не настроена на сервере");
  const userId = authenticated(req),
    orgId = id(req, "orgId"),
    c = await chatAccess(userId, orgId, id(req, "chatId"));
  const question = z.string().min(1).max(8000).parse(req.body.text),
    key = z.string().min(8).parse(req.get("idempotency-key"));
  await limit("chat:" + userId, 10, 600);
  const assistantId = randomUUID();
  const accepted = await enqueue({
    orgId,
    scopeId: c.scopeId,
    userId,
    kind: "chat",
    resourceId: c.id,
    from: new Date(),
    to: new Date(),
    snapshot: {
      profile: await effectiveProfile(orgId, c.scopeId),
      question,
      assistantId,
    },
    key,
    payload: { chatId: c.id, question },
  });
  res.status(202).json(accepted);
});
chats.patch("/:chatId/visibility", async (req, res) => {
  const userId = authenticated(req),
    c = await chatAccess(userId, id(req, "orgId"), id(req, "chatId"));
  if (c.userId !== userId)
    fail(403, "FORBIDDEN", "Только автор может раскрыть переписку");
  const visibility = z.enum(["private", "shared"]).parse(req.body.visibility);
  if (visibility === "shared" && req.body.confirmEntireThread !== true)
    fail(
      422,
      "CONFIRM_REQUIRED",
      "Подтвердите раскрытие всей текущей переписки",
    );
  res.json(
    await db.chatThread.update({ where: { id: c.id }, data: { visibility } }),
  );
  await audit(userId, c.orgId, "chat.visibility", { chatId: c.id, visibility });
});
chats.post("/:chatId/decisions", async (req, res) => {
  const userId = authenticated(req),
    c = await chatAccess(userId, id(req, "orgId"), id(req, "chatId"));
  await access(userId, c.orgId, c.scopeId, true);
  const input = z
    .object({
      text: z.string().min(1).max(5000),
      assertion: z.enum(["confirmed", "hypothesis"]),
      confirmed: z.literal(true),
    })
    .parse(req.body);
  res.status(201).json(
    await db.decision.create({
      data: {
        orgId: c.orgId,
        scopeId: c.scopeId,
        userId,
        threadId: c.id,
        text: input.text,
        assertion: input.assertion,
      },
    }),
  );
});
