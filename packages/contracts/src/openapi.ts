import { z } from "zod";
import {
  credentials,
  organizationInput,
  profileInput,
  runInput,
  invitationInput,
  competitorInput,
  evidenceSchema,
  assessmentSchema,
} from "./index.ts";
const base = "/organizations/{orgId}",
  scope = base + "/scopes/{scopeId}";
const routes: [string, string, z.ZodType?][] = [
  ["get", "/auth/csrf"],
  ["post", "/auth/register", credentials],
  ["post", "/auth/login", credentials],
  ["post", "/auth/logout"],
  ["post", "/auth/demo"],
  ["get", "/auth/me"],
  ["patch", "/auth/me"],
  ["post", "/auth/verify-email"],
  ["post", "/auth/forgot-password"],
  ["post", "/auth/reset-password"],
  ["post", "/auth/change-password"],
  ["get", "/organizations"],
  ["post", "/organizations", organizationInput],
  ["get", base],
  ["patch", base, organizationInput.partial()],
  ["delete", base],
  ["get", base + "/scopes"],
  ["post", base + "/scopes"],
  ["get", scope],
  ["patch", scope],
  ...[base, scope].flatMap(
    (p) =>
      [
        ["get", p + "/profile"],
        ["patch", p + "/profile", profileInput],
        ["get", p + "/profile-proposals"],
        ["post", p + "/profile-proposals", profileInput],
        ["post", p + "/profile-proposals/{proposalId}/confirm", profileInput],
      ] as [string, string, z.ZodType?][],
  ),
  ["get", base + "/members"],
  ["get", base + "/members/{memberId}"],
  ["patch", base + "/members/{memberId}"],
  ["delete", base + "/members/{memberId}"],
  ["post", base + "/transfer-ownership"],
  ["get", base + "/invitations"],
  ["post", base + "/invitations", invitationInput],
  ["delete", base + "/invitations/{invitationId}"],
  ["post", "/invitations/accept"],
  ["get", base + "/documents"],
  ["post", base + "/documents"],
  ["get", base + "/documents/{documentId}"],
  ["delete", base + "/documents/{documentId}"],
  ["get", base + "/documents/{documentId}/download"],
  ["get", base + "/documents/{documentId}/chunks"],
  ["post", base + "/documents/{documentId}/retry"],
  ["get", scope + "/competitors"],
  ["post", scope + "/competitors", competitorInput],
  ["patch", scope + "/competitors/{competitorId}", competitorInput.partial()],
  ["post", scope + "/competitor-searches"],
  ["post", scope + "/competitor-proposals/{competitorId}/decision"],
  ["post", scope + "/insight-runs", runInput],
  ["get", scope + "/insight-runs"],
  ["get", scope + "/insight-runs/{runId}"],
  ["get", scope + "/insight-runs/{runId}/previews"],
  ["post", scope + "/insight-runs/{runId}/cancel"],
  ["post", scope + "/insight-runs/{runId}/accept-partial"],
  ["get", base + "/insights"],
  ["get", base + "/insights/{insightId}"],
  ["get", base + "/insights/{insightId}/revisions"],
  ["patch", base + "/insights/{insightId}/work-status"],
  ["post", base + "/insights/{insightId}/read"],
  ["post", base + "/insights/{insightId}/feedback"],
  ["get", base + "/evidence/{sourceId}"],
  ["get", base + "/chats"],
  ["post", base + "/chats"],
  ["get", base + "/chats/{chatId}"],
  ["post", base + "/chats/{chatId}/messages"],
  ["patch", base + "/chats/{chatId}/visibility"],
  ["post", base + "/chats/{chatId}/decisions"],
  ["get", "/jobs/{jobId}"],
  ["get", "/jobs/{jobId}/events"],
  ["get", "/config/public"],
  ["get", "/health/live"],
  ["get", "/health/ready"],
];
const schema = (s: z.ZodType) => {
  const { $schema: _version, ...body } = z.toJSONSchema(s, { io: "input" });
  return body;
};
export function openapi() {
  const paths: Record<string, any> = {};
  for (const [method, path, input] of routes) {
    const mutation = method !== "get";
    const accepted =
      method === "post" &&
      /insight-runs$|competitor-searches$|messages$|documents$|retry$/.test(
        path,
      );
    const params = [...path.matchAll(/\{([^}]+)\}/g)].map((m) => ({
      name: m[1],
      in: "path",
      required: true,
      schema: { type: "string", format: "uuid" },
    }));
    const created =
      method === "post" &&
      /(?:^\/organizations$|\/auth\/register$|\/scopes$|\/invitations$|\/profile-proposals$|\/competitors$|\/chats$|\/decisions$)/.test(
        path,
      );
    const isList =
      method === "get" &&
      /\/(?:organizations|scopes|members|invitations|documents|chunks|competitors|insight-runs|insights|revisions|chats|previews|profile-proposals)$/.test(
        path,
      );
    paths[path] ??= {};
    paths[path][method] = {
      summary: method.toUpperCase() + " " + path,
      security: [{ session: [] }],
      parameters: [
        ...params,
        ...(isList
          ? [
              {
                name: "limit",
                in: "query",
                schema: {
                  type: "integer",
                  default: 20,
                  minimum: 1,
                  maximum: 100,
                },
              },
              { name: "cursor", in: "query", schema: { type: "string" } },
            ]
          : []),
        ...(mutation
          ? [
              {
                name: "X-CSRF-Token",
                in: "header",
                required: true,
                schema: { type: "string" },
              },
              {
                name: "Origin",
                in: "header",
                required: true,
                schema: { type: "string" },
              },
            ]
          : []),
        ...(accepted
          ? [
              {
                name: "Idempotency-Key",
                in: "header",
                required: true,
                schema: { type: "string", minLength: 8 },
              },
            ]
          : []),
      ],
      ...(input
        ? {
            requestBody: {
              required: true,
              content: { "application/json": { schema: schema(input) } },
            },
          }
        : {}),
      responses: {
        [accepted ? "202" : created ? "201" : "200"]: {
          description: accepted
            ? "Фоновое задание принято; повтор безопасен"
            : "Успешный результат",
          content: {
            "application/json": {
              schema: accepted
                ? { $ref: "#/components/schemas/JobAccepted" }
                : isList
                  ? {
                      type: "object",
                      properties: {
                        items: { type: "array", items: { type: "object" } },
                        nextCursor: { type: ["string", "null"] },
                      },
                    }
                  : { type: "object" },
            },
          },
        },
        "401": { description: "Требуется вход" },
        "403": { description: "Недостаточно прав или неверный CSRF/Origin" },
        "404": { description: "Объект отсутствует или недоступен" },
        "409": { description: "Конфликт версии или Idempotency-Key" },
        "422": { description: "Невалидный запрос" },
        "429": { description: "Превышен лимит, details.retryAfter" },
        "503": { description: "Интеграция не настроена" },
      },
    };
    if (method === "post" && path === base + "/documents")
      paths[path][method].requestBody = {
        required: true,
        content: {
          "multipart/form-data": {
            schema: {
              type: "object",
              required: ["file"],
              properties: {
                file: { type: "string", format: "binary" },
                scopeId: { type: "string", format: "uuid" },
              },
            },
          },
        },
      };
    if (path.endsWith("/events"))
      paths[path][method].responses["200"].content = {
        "text/event-stream": { schema: { type: "string" } },
      };
    if (path.endsWith("/download"))
      paths[path][method].responses["200"].content = {
        "application/octet-stream": {
          schema: { type: "string", format: "binary" },
        },
      };
    for (const status of ["401", "403", "404", "409", "422", "429", "503"])
      paths[path][method].responses[status].content = {
        "application/json": { schema: { $ref: "#/components/schemas/Error" } },
      };
  }
  return {
    openapi: "3.1.0",
    info: { title: "Контекст REST API", version: "0.1.0" },
    servers: [{ url: "/api/v1" }],
    paths,
    components: {
      securitySchemes: {
        session: { type: "apiKey", in: "cookie", name: "context_session" },
      },
      schemas: {
        EvidenceRef: schema(evidenceSchema),
        Assessment: schema(assessmentSchema),
        JobAccepted: schema(
          z.object({
            jobId: z.uuid(),
            resourceId: z.string(),
            status: z.string(),
            reused: z.boolean(),
          }),
        ),
        Error: schema(
          z.object({
            error: z.object({
              code: z.string(),
              message: z.string(),
              requestId: z.string(),
              details: z.unknown().optional(),
            }),
          }),
        ),
      },
    },
  };
}
