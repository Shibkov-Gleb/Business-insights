import { z } from "zod";
export * from "./research.ts";
export * from "./corporate.ts";
export const stages = [
  "idea",
  "validation",
  "mvp",
  "early_revenue",
  "growth",
  "established",
] as const;
export const roles = ["owner", "admin", "analyst", "reader"] as const;
export const stageLabels: Record<string, string> = {
  idea: "Идея",
  validation: "Проверка гипотез",
  mvp: "MVP",
  early_revenue: "Первые продажи",
  growth: "Рост",
  established: "Действующий бизнес",
};
export const credentials = z.object({
  email: z.email().transform((x) => x.trim().toLowerCase()),
  password: z.string().min(12).max(256),
});
export const organizationInput = z.object({
  name: z.string().trim().min(2).max(120),
  stage: z.enum(stages),
  description: z.string().trim().min(20).max(5000),
});
export const profileInput = z.object({
  expectedVersion: z.number().int().nonnegative(),
  fields: z.record(z.string(), z.unknown()),
});
export const runInput = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("normal"),
    initialFrom: z.iso.datetime({ offset: true }).optional(),
  }),
  z.object({
    mode: z.literal("historical_rescan"),
    from: z.iso.datetime({ offset: true }),
    to: z.iso.datetime({ offset: true }),
  }),
]);
export const invitationInput = z.object({
  email: z.email().optional(),
  role: z.enum(["admin", "analyst", "reader"]),
  allScopes: z.boolean().default(true),
  scopeIds: z.array(z.uuid()).default([]),
});
export const competitorInput = z.object({
  name: z.string().min(2).max(200),
  domain: z.string().max(253).optional(),
  aliases: z.array(z.string()).default([]),
  type: z.enum(["direct", "indirect", "alternative"]).default("direct"),
  reason: z.string().max(5000).default("Добавлен пользователем"),
  decision: z.enum(["proposed", "confirmed", "rejected"]).default("confirmed"),
  monitoring: z.enum(["active", "disabled"]).default("active"),
  sources: z.array(z.string()).default([]),
});
export const evidenceSchema = z.object({
  id: z.string(),
  kind: z.enum(["external", "company_document", "company_feature"]),
  sourceId: z.string(),
  sourceSnapshotId: z.string().optional(),
  locator: z
    .object({
      page: z.number().optional(),
      slide: z.number().optional(),
      paragraph: z.number().optional(),
      section: z.string().optional(),
    })
    .optional(),
  profileVersionId: z.string().optional(),
  publishedAt: z.string().optional(),
  quote: z.string().optional(),
  url: z.string().optional(),
  title: z.string().optional(),
  availability: z.enum(["available", "deleted", "unavailable"]),
});
export const claimSchema = z.object({
  text: z.string(),
  classification: z.enum(["fact", "interpretation", "hypothesis", "proposal"]),
  evidenceIds: z.array(z.string()),
});
export const assessmentSchema = z.object({
  title: z.string().max(200),
  summary: z.string(),
  why: z.string(),
  featureRefs: z.array(z.string()).min(1),
  claims: z.array(claimSchema),
  risks: z.array(z.string()),
  opportunities: z.array(z.string()),
  actions: z.array(z.string()),
  unknowns: z.array(z.string()),
  horizon: z.string(),
  relevance: z.number().int().min(1).max(5),
  impact: z.number().int().min(1).max(5),
  urgency: z.number().int().min(1).max(5),
  confidence: z.enum(["low", "medium", "high"]),
  confidenceReason: z.string(),
  dependencyConfirmed: z.boolean(),
  conflicts: z.boolean().default(false),
  correctsPrevious: z.boolean().default(false),
  changeSummary: z.string().default(""),
});
export type Assessment = z.infer<typeof assessmentSchema>;
export type EvidenceRef = z.infer<typeof evidenceSchema>;
export type Role = (typeof roles)[number];
export type JobAccepted = {
  jobId: string;
  resourceId: string;
  status: string;
  reused: boolean;
};
export const runStatuses = [
  "queued",
  "running",
  "cancel_requested",
  "succeeded",
  "partial",
  "failed",
  "cancelled",
] as const;
export type RunStatus = (typeof runStatuses)[number];
