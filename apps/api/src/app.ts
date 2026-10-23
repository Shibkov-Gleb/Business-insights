import express from "express";
import { randomUUID } from "node:crypto";
import cookieParser from "cookie-parser";
import { MulterError } from "multer";
import { ZodError } from "zod";
import { db } from "@context/db";
import { publicConfig } from "@context/config";
import { HttpError, redis, session } from "./core.ts";
import { auth } from "./auth.ts";
import { organizations, invitations } from "./organizations.ts";
import { runs, jobs } from "./jobs.ts";
import { documents } from "./documents.ts";
import { competitors } from "./competitors.ts";
import { insights, evidence } from "./insights.ts";
import { chats } from "./chats.ts";
import { deletion } from "./deletion.ts";
import { openapi } from "../../../packages/contracts/src/openapi.ts";
export const app = express();
app.disable("x-powered-by");
app.use((req, res, next) => {
  req.requestId = randomUUID();
  res.setHeader("X-Request-Id", req.requestId);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("Cache-Control", "no-store");
  next();
});
app.use(express.json({ limit: "256kb" }), cookieParser());
app.get("/api/v1/health/live", (_req, res) => res.json({ ok: true }));
app.get("/api/v1/health/ready", async (_req, res) => {
  await db.$queryRaw`SELECT 1`;
  await redis.ping();
  res.json({ ok: true });
});
app.use("/api/v1", session);
app.get("/api/v1/config/public", (_req, res) => res.json(publicConfig()));
app.get("/api/v1/openapi.json", (_req, res) => res.json(openapi()));
app.use("/api/v1/auth", auth);
app.use("/api/v1/organizations", organizations);
app.use("/api/v1/organizations", deletion);
app.use("/api/v1/invitations", invitations);
app.use("/api/v1/organizations/:orgId/scopes/:scopeId/insight-runs", runs);
app.use("/api/v1/organizations/:orgId/scopes/:scopeId", competitors);
app.use("/api/v1/organizations/:orgId/documents", documents);
app.use("/api/v1/organizations/:orgId/insights", insights);
app.use("/api/v1/organizations/:orgId/evidence", evidence);
app.use("/api/v1/organizations/:orgId/chats", chats);
app.use("/api/v1/jobs", jobs);
export function finishRoutes() {
  app.use((_req, _res, next) =>
    next(new HttpError(404, "NOT_FOUND", "Объект не найден")),
  );
  app.use(
    (
      error: unknown,
      req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      const err =
        error &&
        typeof error === "object" &&
        "type" in error &&
        error.type === "entity.parse.failed"
          ? new HttpError(422, "INVALID_JSON", "Некорректный JSON запроса")
          : error instanceof MulterError
            ? new HttpError(
                422,
                "INVALID_UPLOAD",
                "Файл превышает лимит или неверно сформирован запрос",
              )
            : error instanceof Error && error.message === "IDEMPOTENCY_CONFLICT"
              ? new HttpError(
                  409,
                  "IDEMPOTENCY_CONFLICT",
                  "Ключ уже использован с другим запросом",
                )
              : error;
      if (err instanceof ZodError) {
        res.status(422).json({
          error: {
            code: "VALIDATION",
            message: "Проверьте заполнение полей",
            requestId: req.requestId,
            details: err.issues.map((x) => ({
              path: x.path,
              message: x.message,
            })),
          },
        });
        return;
      }
      if (err instanceof HttpError) {
        res.status(err.status).json({
          error: {
            code: err.code,
            message: err.message,
            requestId: req.requestId,
            details: err.details,
          },
        });
        return;
      }
      console.error(
        JSON.stringify({
          requestId: req.requestId,
          error: err instanceof Error ? err.name : "UnknownError",
        }),
      );
      res.status(500).json({
        error: {
          code: "INTERNAL",
          message: "Внутренняя ошибка сервера",
          requestId: req.requestId,
        },
      });
    },
  );
}
