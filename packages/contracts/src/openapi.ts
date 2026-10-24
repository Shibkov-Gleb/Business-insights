import { z } from "zod";
import {
  companyContextSchema,
  corporateContextUpdate,
  corporatePreferences,
  corporateRunInput,
  corporateNewsInput,
  corporateInsightSchema,
  corporateRevisionSchema,
  corporateEvidence,
  corporateCompanyItem,
  corporateRunSchema,
  corporateChatSchema,
  corporateFeedbackSchema,
  corporateTraceSchema,
  bankMaterialSchema,
  bankPageSchema,
  dailyBudgetSchema,
  importReportSchema,
  hackathonIntegrationSchema,
  expertFeedbackInput,
} from "./corporate.ts";
import {
  credentials,
  organizationInput,
  profileInput,
  runInput,
  invitationInput,
  competitorInput,
  evidenceSchema,
  assessmentSchema,
  researchInput,
  watchInput,
  manualFactsInput,
  sourceSnapshotDto,
  snapshotDto,
  changeDto,
  briefDto,
  dossierDto,
  researchRunDto,
  overviewDto,
  comparisonDto,
  competitorDto,
  factSchema,
} from "./index.ts";
const base = "/organizations/{orgId}",
  scope = base + "/scopes/{scopeId}";
const routes: [string, string, z.ZodType?][] = [
  ["get", "/bank/companies"],
  ["get", "/bank/groups"],
  ["get", "/bank/companies/{companyId}/context"],
  ["patch", "/bank/companies/{companyId}/context", corporateContextUpdate],
  ["get", "/bank/companies/{companyId}/context/versions"],
  ["patch", "/bank/companies/{companyId}/preferences", corporatePreferences],
  ["get", "/bank/companies/{companyId}/feed"],
  ["get", "/bank/companies/{companyId}/insights/{insightId}"],
  ["get", "/bank/companies/{companyId}/insights/{insightId}/revisions"],
  ["post", "/bank/companies/{companyId}/news", corporateNewsInput],
  ["get", "/bank/companies/{companyId}/news"],
  ["post", "/bank/companies/{companyId}/runs", corporateRunInput],
  ["get", "/bank/companies/{companyId}/runs"],
  ["post", "/bank/companies/{companyId}/runs/{runId}/cancel"],
  ["get", "/bank/companies/{companyId}/runs/{runId}/trace"],
  ["get", "/bank/companies/{companyId}/evidence"],
  ["get", "/bank/companies/{companyId}/chats"],
  [
    "post",
    "/bank/companies/{companyId}/chats",
    z.object({
      question: z.string().min(3).max(6000),
      insightId: z.uuid().optional(),
      role: corporatePreferences.shape.role.optional(),
    }),
  ],
  ["post", "/bank/companies/{companyId}/feedback", expertFeedbackInput],
  ["get", "/bank/companies/{companyId}/feedback"],
  [
    "patch",
    "/bank/companies/{companyId}/feedback/{feedbackId}",
    z.object({
      expertNote: z.string().min(3).max(5000),
      reviewStatus: z.enum(["open", "reviewed"]),
    }),
  ],
  ["get", "/bank/integration"],
  ["get", "/bank/imports"],
  ["get", "/bank/materials"],
  ["post", "/bank/materials/import"],
  ["get", "/bank/materials/{materialId}/pages/{page}"],
  ["get", "/bank/materials/{materialId}/original"],
  ["post", scope + "/research-runs", researchInput],
  ["get", scope + "/research-runs"],
  ["get", scope + "/research-runs/{runId}"],
  ["post", scope + "/research-runs/{runId}/cancel"],
  ["get", scope + "/market-overview"],
  ["get", scope + "/competitor-comparison"],
  ["get", scope + "/competitors/{competitorId}/dossier"],
  ["post", scope + "/competitors/{competitorId}/watch-sources", watchInput],
  [
    "delete",
    scope + "/competitors/{competitorId}/watch-sources/{watchId}",
    z.object({ expectedVersion: z.number().int().positive() }),
  ],
  [
    "patch",
    scope + "/competitors/{competitorId}/manual-facts",
    manualFactsInput,
  ],
  ["get", scope + "/source-snapshots/{snapshotId}"],
  ["get", scope + "/research-briefs"],
  ["post", scope + "/research-briefs", z.object({ runId: z.uuid() })],
  ["get", scope + "/research-briefs/{briefId}"],
  ["get", scope + "/research-briefs/{briefId}/export"],
  [
    "post",
    scope + "/research-briefs/{briefId}/decision",
    z.object({ confirm: z.literal(true) }),
  ],
  ["get", scope + "/research-decisions"],
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
      /research-runs$|insight-runs$|competitor-searches$|messages$|documents$|retry$|\/bank\/companies\/[^/]+\/(runs|chats)$|\/bank\/materials\/import$/.test(
        path,
      );
    const params = [...path.matchAll(/\{([^}]+)\}/g)].map((m) => ({
      name: m[1],
      in: "path",
      required: true,
      schema:
        m[1] === "page"
          ? { type: "integer", minimum: 1 }
          : { type: "string", format: "uuid" },
    }));
    const created =
      method === "post" &&
      /(?:^\/organizations$|\/auth\/register$|\/scopes$|\/invitations$|\/profile-proposals$|\/competitors$|\/chats$|\/decisions$|\/watch-sources$|\/decision$)/.test(
        path,
      );
    const isList =
      method === "get" &&
      /\/(?:organizations|scopes|members|invitations|documents|chunks|competitors|research-runs|insight-runs|insights|revisions|chats|previews|profile-proposals)$/.test(
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
    if (method === "get" && path.endsWith("/export"))
      paths[path][method].responses["200"].content = {
        "text/markdown": { schema: { type: "string" } },
      };
    const responseDto =
      method === "get"
        ? path.endsWith("/market-overview")
          ? overviewDto
          : path.endsWith("/competitor-comparison")
            ? comparisonDto
            : path.endsWith("/dossier")
              ? dossierDto
              : path.endsWith("/source-snapshots/{snapshotId}")
                ? sourceSnapshotDto
                : path.endsWith("/research-briefs/{briefId}")
                  ? briefDto
                  : path.endsWith("/research-briefs")
                    ? z.object({ items: z.array(briefDto) })
                    : path.endsWith("/research-runs/{runId}")
                      ? researchRunDto
                      : path.endsWith("/research-runs")
                        ? z.object({
                            items: z.array(researchRunDto),
                            nextCursor: z.string().nullable(),
                          })
                        : null
        : null;
    if (responseDto)
      paths[path][method].responses["200"].content = {
        "application/json": { schema: schema(responseDto) },
      };
    if (path.endsWith("/market-overview"))
      paths[path][method].parameters.push({
        name: "days",
        in: "query",
        schema: { type: "integer", default: 30, minimum: 1, maximum: 365 },
      });
    if (path.endsWith("/competitor-comparison"))
      paths[path][method].parameters.push({
        name: "ids",
        in: "query",
        required: true,
        description:
          "2–5 уникальных UUID подтверждённых конкурентов, через запятую",
        schema: { type: "string" },
      });
    for (const status of ["401", "403", "404", "409", "422", "429", "503"])
      paths[path][method].responses[status].content = {
        "application/json": { schema: { $ref: "#/components/schemas/Error" } },
      };
  }
  const bankResponses: Record<string, z.ZodType> = {
    "/bank/companies": z.object({
      items: z.array(corporateCompanyItem),
      nextCursor: z.string().nullable(),
    }),
    "/bank/companies/{companyId}/context": companyContextSchema,
    "/bank/companies/{companyId}/feed": z.object({
      items: z.array(corporateInsightSchema),
      nextCursor: z.string().nullable(),
      role: z.string(),
      interests: z.array(z.string()),
    }),
    "/bank/companies/{companyId}/insights/{insightId}": corporateInsightSchema,
    "/bank/companies/{companyId}/insights/{insightId}/revisions": z.object({
      items: z.array(corporateRevisionSchema),
      nextCursor: z.string().nullable(),
    }),
    "/bank/companies/{companyId}/runs": z.object({
      items: z.array(corporateRunSchema),
      nextCursor: z.string().nullable(),
    }),
    "/bank/companies/{companyId}/runs/{runId}/trace": z.object({
      run: corporateRunSchema,
      items: z.array(corporateTraceSchema),
    }),
    "/bank/companies/{companyId}/chats": z.object({
      items: z.array(corporateChatSchema),
      nextCursor: z.string().nullable(),
    }),
    "/bank/companies/{companyId}/feedback": z.object({
      items: z.array(corporateFeedbackSchema),
      nextCursor: z.string().nullable(),
    }),
    "/bank/materials": z.object({
      items: z.array(bankMaterialSchema),
      nextCursor: z.string().nullable(),
      missing: z.array(z.string()),
    }),
    "/bank/materials/{materialId}/pages/{page}": bankPageSchema,
    "/bank/imports": z.object({
      items: z.array(importReportSchema),
      nextCursor: z.string().nullable(),
    }),
    "/bank/integration": hackathonIntegrationSchema,
  };
  for (const [path, dto] of Object.entries(bankResponses))
    paths[path].get.responses["200"].content = {
      "application/json": { schema: schema(dto) },
    };
  for (const [path, methods] of Object.entries(paths))
    for (const method of Object.keys(methods))
      if (path.startsWith("/bank/"))
        methods[method].security = [{ alfaSession: [] }];
  paths["/bank/companies/{companyId}/feed"].get.parameters.push(
    ...[
      {
        name: "role",
        in: "query",
        schema: schema(corporatePreferences.shape.role),
      },
      {
        name: "days",
        in: "query",
        schema: { type: "integer", minimum: 1, maximum: 3650, default: 30 },
      },
      {
        name: "category",
        in: "query",
        schema: {
          type: "string",
          enum: ["all", "risk", "opportunity", "mixed", "background"],
        },
      },
      { name: "cursor", in: "query", schema: { type: "string" } },
      {
        name: "limit",
        in: "query",
        schema: { type: "integer", minimum: 1, maximum: 50, default: 20 },
      },
    ],
  );
  paths["/bank/materials/{materialId}/original"].get.responses["200"].content =
    { "application/pdf": { schema: { type: "string", format: "binary" } } };
  paths["/bank/companies/{companyId}/insights/{insightId}"].get.parameters.push(
    {
      name: "revision",
      in: "query",
      schema: { type: "string", format: "uuid" },
      description: "Неизменяемая историческая версия; по умолчанию последняя",
    },
  );
  paths["/bank/materials/import"].post.requestBody = {
    required: true,
    content: {
      "multipart/form-data": {
        schema: {
          type: "object",
          required: ["file", "title"],
          properties: {
            file: {
              type: "string",
              format: "binary",
              description: "PDF до 100 MiB; только администратор",
            },
            title: { type: "string" },
            publishedAt: { type: "string", format: "date-time" },
            dateConfirmed: { type: "string", enum: ["true", "false"] },
          },
        },
      },
    },
  };
  return {
    openapi: "3.1.0",
    info: { title: "Контекст · Альфа Хак REST API", version: "alfa-2026-dev" },
    servers: [{ url: "/api/v1" }],
    paths,
    components: {
      securitySchemes: {
        alfaSession: {
          type: "apiKey",
          in: "cookie",
          name: "context_alfa_session",
        },
        session: { type: "apiKey", in: "cookie", name: "context_session" },
      },
      schemas: {
        CorporateContext: schema(companyContextSchema),
        CorporateInsight: schema(corporateInsightSchema),
        CorporateEvidence: schema(corporateEvidence),
        BankMaterial: schema(bankMaterialSchema),
        BankPage: schema(bankPageSchema),
        DailyBudget: schema(dailyBudgetSchema),
        DatasetImport: schema(importReportSchema),
        CorporateTrace: schema(corporateTraceSchema),
        SourceSnapshot: schema(sourceSnapshotDto),
        Competitor: schema(competitorDto),
        CompetitorSnapshot: schema(snapshotDto),
        CompetitorChange: schema(changeDto),
        ResearchFact: schema(factSchema),
        ResearchBrief: schema(briefDto),
        ResearchRun: schema(researchRunDto),
        MarketOverview: schema(overviewDto),
        CompetitorComparison: schema(comparisonDto),
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
