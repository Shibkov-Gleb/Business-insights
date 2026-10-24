import { z } from "zod";
export const workRoles = ["owner", "ceo", "cfo", "accountant", "treasurer", "executive", "employee"] as const;
export const workRoleLabels: Record<typeof workRoles[number], string> = { owner: "Собственник", ceo: "Генеральный директор", cfo: "Финансовый директор", accountant: "Главный бухгалтер", treasurer: "Казначей", executive: "Другой C-level", employee: "Сотрудник" };
export const impactChannels = ["financing", "liquidity", "demand", "supply", "regulation", "fx", "strategy"] as const;
export const corporateEvidence = z.object({
  id: z.string(), kind: z.enum(["news", "bank", "csv", "calculation", "synthetic"]), sourceId: z.string(),
  quote: z.string().min(1), page: z.number().int().positive().optional(), row: z.number().int().positive().optional(),
  field: z.string().optional(), publishedAt: z.string().nullable().optional(), title: z.string(), url: z.string().optional(),
  confidence: z.enum(["verified", "ocr_uncertain", "unknown"]), historical: z.boolean().default(false),
});
export const corporateFact = z.object({ key: z.string(), value: z.string(), origin: z.enum(["csv", "calculation", "synthetic", "user"]), evidence: corporateEvidence, confirmed: z.boolean() });
export const companyContextSchema = z.object({
  id: z.uuid(), name: z.string(), externalId: z.string(), groupId: z.string().nullable(), version: z.number().int(),
  synthetic: z.boolean(), facts: z.array(corporateFact), conflicts: z.array(z.string()), unknowns: z.array(z.string()),
  dependencies: z.array(z.object({ counterparty: z.string(), direction: z.enum(["incoming", "outgoing"]), amount: z.string(), count: z.string(), share: z.number(), unknownCompany: z.boolean() })),
  datasetPosition: z.object({ revenueRank: z.number().int().nullable(), companyCount: z.number().int(), datasetRevenueShare: z.string().nullable(), realMarketShare: z.null() }),
});
export const corporateAssessment = z.object({
  title: z.string().min(1).max(200), what: z.string().min(1), why: z.string().min(1),
  companyFeatureKeys: z.array(z.string()).min(1), externalEvidenceIds: z.array(z.string()).min(1),
  bankView: z.object({ text: z.string(), evidenceIds: z.array(z.string()).min(1) }).nullable(),
  consequences: z.array(z.string()), checks: z.array(z.string()).min(1), unknowns: z.array(z.string()),
  channels: z.array(z.enum(impactChannels)).min(1), relevance: z.number().int().min(1).max(5),
  impact: z.number().int().min(1).max(5), urgency: z.number().int().min(1).max(5),
  confidence: z.enum(["low", "medium", "high"]), category: z.enum(["risk", "opportunity", "mixed", "background"]),
});
export const corporateInsightSchema = z.object({ id: z.uuid(), companyId: z.uuid(), runId: z.uuid(), createdAt: z.string(), score: z.number(), data: corporateAssessment, evidence: z.array(corporateEvidence), synthetic: z.boolean() });
export const corporatePreferences = z.object({ role: z.enum(workRoles), interests: z.array(z.enum(impactChannels)).max(7).default([]) });
export const corporateRunInput = z.object({ expectedVersion: z.number().int().positive(), from: z.iso.datetime().optional(), to: z.iso.datetime().optional(), newsIds: z.array(z.uuid()).max(20).default([]), search: z.boolean().default(true) });
export const corporateNewsInput = z.object({ title: z.string().trim().min(3).max(200), url: z.url().optional(), text: z.string().trim().min(30).max(60000).optional(), publishedAt: z.iso.datetime().optional() }).refine(x => !!(x.url || x.text), "Нужен URL или текст");
export const bankMaterialSchema = z.object({ id: z.uuid(), title: z.string(), filename: z.string(), publishedAt: z.string().nullable(), dateStatus: z.string(), status: z.string(), pages: z.number().int(), sha256: z.string(), coverage: z.unknown() });
export const corporateTraceSchema = z.object({ id: z.uuid(), runId: z.uuid(), stage: z.string(), tool: z.string(), status: z.string(), durationMs: z.number().int(), data: z.unknown(), createdAt: z.string() });
export const dailyBudgetSchema = z.object({ day: z.string(), timezone: z.string(), capRub: z.string(), spentRub: z.string(), reservedRub: z.string(), remainingRub: z.string(), pricingKnown: z.boolean() });
export const importReportSchema = z.object({ id: z.uuid(), filename: z.string(), sha256: z.string(), kind: z.string(), status: z.string(), rows: z.number().int(), report: z.unknown(), settings: z.unknown(), createdAt: z.string() });
export const expertFeedbackInput = z.object({ insightId: z.uuid(), verdict: z.enum(["useful", "irrelevant", "wrong_evidence", "wrong_bank", "needs_review"]), comment: z.string().max(5000).default("") });
export type CompanyContext = z.infer<typeof companyContextSchema>;
export type CorporateAssessment = z.infer<typeof corporateAssessment>;
export type CorporateEvidence = z.infer<typeof corporateEvidence>;
export type CorporateFact = z.infer<typeof corporateFact>;
export type CorporateInsight = z.infer<typeof corporateInsightSchema>;
export type WorkRole = typeof workRoles[number];
