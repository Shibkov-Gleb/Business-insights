import { Router } from "express";
import argon2 from "argon2";
import { z } from "zod";
import nodemailer from "nodemailer";
import { db } from "@context/db";
import { config } from "@context/config";
import { credentials } from "@context/contracts";
import { authenticated, fail, hash, limit, newSession, token, sessionCookie } from "./core.ts";
export const auth = Router();
auth.post("/demo", async (req, res) => {
  if (config.APP_MODE !== "demo") fail(404, "NOT_FOUND", "Объект не найден");
  await limit("demo:" + req.ip, 20, 600);
  const user = await db.user.findUnique({
    where: { email: "founder@example.test" },
  });
  if (!user) fail(503, "DEMO_NOT_SEEDED", "Выполните demo seed");
  res.json({ csrfToken: await newSession(req, res, user!.id) });
});
export interface MailProvider {
  send(to: string, subject: string, text: string): Promise<void>;
}
export const mailProvider: MailProvider = { send: sendMail };
auth.patch("/me", async (req, res) => {
  const timezone = z.string().max(100).parse(req.body.timezone);
  try {
    new Intl.DateTimeFormat("ru", { timeZone: timezone }).format();
  } catch {
    fail(422, "TIMEZONE", "Неизвестный часовой пояс");
  }
  res.json(
    await db.user.update({
      where: { id: authenticated(req) },
      data: { timezone },
      select: { id: true, email: true, timezone: true },
    }),
  );
});
export async function sendMail(to: string, subject: string, text: string) {
  if (!config.SMTP_HOST)
    fail(503, "MAIL_NOT_READY", "Почтовый сервер не настроен");
  const transport = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_PORT === 465,
    auth: config.SMTP_USER
      ? { user: config.SMTP_USER, pass: config.SMTP_PASSWORD }
      : undefined,
  });
  await transport.sendMail({ from: config.SMTP_FROM, to, subject, text });
}
async function issue(userId: string, email: string, kind: string) {
  const raw = token();
  await db.authToken.create({
    data: {
      id: hash(raw),
      userId,
      kind,
      expiresAt: new Date(
        Date.now() + (kind === "verify" ? 86400000 : 1800000),
      ),
    },
  });
  await sendMail(
    email,
    kind === "verify"
      ? "Подтвердите email — Контекст"
      : "Восстановление доступа — Контекст",
    `Откройте ссылку: ${config.PUBLIC_APP_URL}/?action=${kind}&token=${raw}\nЕсли вы не запрашивали это действие, проигнорируйте письмо.`,
  );
}
auth.get("/csrf", async (req, res) =>
  res.json({ csrfToken: req.csrf || (await newSession(req, res)) }),
);
auth.post("/register", async (req, res) => {
  const input = credentials.parse(req.body);
  await limit("register:" + req.ip, 10, 3600);
  if (!config.SMTP_HOST)
    fail(503, "MAIL_NOT_READY", "Почтовый сервер не настроен");
  const old = await db.user.findUnique({ where: { email: input.email } });
  if (old) fail(409, "EMAIL_EXISTS", "Этот email уже зарегистрирован");
  const u = await db.user.create({
    data: {
      email: input.email,
      passwordHash: await argon2.hash(input.password, {
        type: argon2.argon2id,
      }),
    },
  });
  await issue(u.id, u.email, "verify");
  res.status(201).json({ message: "Письмо для подтверждения отправлено" });
});
auth.post("/verify-email", async (req, res) => {
  const raw = z.string().min(32).parse(req.body.token);
  await db.$transaction(async (tx) => {
    const t = await tx.authToken.findUnique({ where: { id: hash(raw) } });
    if (!t || t.kind !== "verify" || t.expiresAt < new Date())
      fail(400, "INVALID_TOKEN", "Ссылка недействительна или устарела");
    const deleted = await tx.authToken.deleteMany({ where: { id: t!.id } });
    if (!deleted.count) fail(400, "INVALID_TOKEN", "Ссылка уже использована");
    await tx.user.update({
      where: { id: t!.userId },
      data: { verified: true },
    });
  });
  res.json({ message: "Email подтверждён. Теперь можно войти." });
});
auth.post("/login", async (req, res) => {
  const input = credentials.parse(req.body);
  await limit("login:" + input.email + ":" + req.ip, 5, 900);
  const u = await db.user.findUnique({ where: { email: input.email } });
  if (!u || !(await argon2.verify(u.passwordHash, input.password)))
    fail(401, "LOGIN_FAILED", "Неверный email или пароль");
  if (!u!.verified) fail(403, "VERIFY_EMAIL", "Подтвердите email");
  res.json({
    csrfToken: await newSession(req, res, u!.id),
    user: { id: u!.id, email: u!.email, timezone: u!.timezone },
  });
});
auth.get("/me", async (req, res) => {
  const u = await db.user.findUniqueOrThrow({
    where: { id: authenticated(req) },
    select: { id: true, email: true, timezone: true },
  });
  res.json(u);
});
auth.post("/logout", async (req, res) => {
  if (req.sessionId)
    await db.session.deleteMany({ where: { id: req.sessionId } });
  res.clearCookie(sessionCookie, { path: "/" });
  res.json({ ok: true });
});
auth.post("/forgot-password", async (req, res) => {
  const email = z.email().parse(req.body.email).toLowerCase();
  await limit("reset:" + email + ":" + req.ip, 3, 3600);
  if (!config.SMTP_HOST)
    fail(503, "MAIL_NOT_READY", "Почтовый сервер не настроен");
  const u = await db.user.findUnique({ where: { email } });
  if (u) await issue(u.id, u.email, "reset");
  res.json({ message: "Если аккаунт существует, письмо отправлено" });
});
auth.post("/reset-password", async (req, res) => {
  const input = z
    .object({
      token: z.string().min(32),
      password: z.string().min(12).max(256),
    })
    .parse(req.body);
  const passwordHash = await argon2.hash(input.password, {
    type: argon2.argon2id,
  });
  await db.$transaction(async (tx) => {
    const t = await tx.authToken.findUnique({
      where: { id: hash(input.token) },
    });
    if (!t || t.kind !== "reset" || t.expiresAt < new Date())
      fail(400, "INVALID_TOKEN", "Ссылка недействительна или устарела");
    if (!(await tx.authToken.deleteMany({ where: { id: t!.id } })).count)
      fail(400, "INVALID_TOKEN", "Ссылка уже использована");
    await tx.user.update({ where: { id: t!.userId }, data: { passwordHash } });
    await tx.session.deleteMany({ where: { userId: t!.userId } });
  });
  res.json({ message: "Пароль обновлён. Войдите заново." });
});
auth.post("/change-password", async (req, res) => {
  const input = z
    .object({ oldPassword: z.string(), password: z.string().min(12).max(256) })
    .parse(req.body);
  const u = await db.user.findUniqueOrThrow({
    where: { id: authenticated(req) },
  });
  if (!(await argon2.verify(u.passwordHash, input.oldPassword)))
    fail(401, "LOGIN_FAILED", "Неверный пароль");
  await db.$transaction([
    db.user.update({
      where: { id: u.id },
      data: {
        passwordHash: await argon2.hash(input.password, {
          type: argon2.argon2id,
        }),
      },
    }),
    db.session.deleteMany({ where: { userId: u.id } }),
  ]);
  res.json({ csrfToken: await newSession(req, res, u.id) });
});
