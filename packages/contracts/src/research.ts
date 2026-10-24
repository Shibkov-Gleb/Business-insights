import { z } from "zod";
export const researchFields = ["audience", "offer", "features", "pricing", "integrations", "cases", "updates"] as const;
export const researchLabels: Record<(typeof researchFields)[number], string> = {
  audience: "Для кого", offer: "Предложение", features: "Возможности", pricing: "Тарифы и условия",
  integrations: "Интеграции", cases: "Кейсы", updates: "Продуктовые изменения",
};
export const contextLabels = { targetCustomer: "Целевой клиент", customerJob: "Задача клиента", geography: "География", monetization: "Монетизация", acquisitionChannels: "Каналы привлечения", businessQuestion: "Главный вопрос сейчас" };
export const stageQuestions: Record<string, string> = {
  idea: "Какую задачу клиент уже решает и какими альтернативами?",
  validation: "Какие признаки спроса стоит проверить на интервью?",
  mvp: "Чем наш продукт отличается для первого целевого сегмента?",
  early_revenue: "Как обосновать цену и повторять успешные продажи?",
  growth: "Какие сегменты и каналы подходят для расширения?",
  established: "Какие изменения рынка влияют на удержание и устойчивость?",
};
export const researchInput = z.object({ competitorIds: z.array(z.uuid()).min(1).max(5).refine(v => new Set(v).size === v.length, "Повтор конкурента"), includeMarket: z.boolean().default(true) });
export const watchInput = z.object({ url: z.url().max(2048), category: z.enum(["product", "pricing", "updates", "cases", "news"]) });
export const factSchema = z.object({
  field: z.enum(researchFields), value: z.string().min(1).max(3000),
  classification: z.enum(["fact", "company_claim", "hypothesis", "user"]),
  sourceSnapshotId: z.uuid().nullable(), quote: z.string().max(4000),
  observedAt: z.iso.datetime({ offset: true }),
  price: z.object({ amount: z.string(), currency: z.string(), period: z.string(), unit: z.string(), conditions: z.string() }).nullable(),
});
export type ResearchFact = z.infer<typeof factSchema>;
export const manualFactsInput = z.object({ expectedVersion: z.number().int().positive(), fields: z.record(z.enum(researchFields), z.string().max(3000)) });
export const briefContentSchema = z.object({ observation: z.string(), implication: z.string(), response: z.string(), validation: z.string(), opportunities: z.array(z.object({ category: z.enum(["segment", "positioning", "channel", "partnership"]), text: z.string(), sourceSnapshotIds: z.array(z.uuid()).min(1) })).max(8), unknowns: z.array(z.string()) });
export type BriefContent = z.infer<typeof briefContentSchema>;
export const sourceSnapshotDto = z.object({ id: z.uuid(), canonicalUrl: z.string(), title: z.string(), text: z.string(), checksum: z.string(), publishedAt: z.string().nullable(), observedAt: z.string(), status: z.string() });
export const competitorDto = z.object({ id: z.uuid(), name: z.string(), decision: z.string(), monitoring: z.string(), revision: z.number(), data: z.record(z.string(), z.unknown()) });
export const snapshotDto = z.object({ id: z.uuid(), competitorId: z.uuid(), runId: z.uuid(), facts: z.array(factSchema), gaps: z.array(z.string()), createdAt: z.string() });
export const changeDto = z.object({ id: z.uuid(), competitorId: z.uuid(), field: z.string(), before: factSchema, after: factSchema, createdAt: z.string() });
export const briefDto = z.object({ id: z.uuid(), title: z.string(), content: briefContentSchema, evidence: z.array(sourceSnapshotDto), createdAt: z.string() });
export const dossierDto = z.object({ competitor: competitorDto, snapshots: z.array(snapshotDto), changes: z.array(changeDto), sources: z.array(z.object({ id: z.uuid(), url: z.string(), category: z.string(), version: z.number() })) });
export const researchRunDto = z.object({ id: z.uuid(), status: z.string(), acceptedAt: z.string(), finishedAt: z.string().nullable(), error: z.string().nullable(), coverage: z.record(z.string(), z.unknown()), budget: z.record(z.string(), z.unknown()) });
export const overviewDto = z.object({ competitors: z.array(competitorDto), changes: z.array(changeDto), briefs: z.array(briefDto), runs: z.array(researchRunDto), lastSuccess: z.string().nullable(), gaps: z.array(z.string()) });
export const comparisonDto = z.object({ own: z.record(z.string(), z.unknown()), competitors: z.array(z.object({ competitor: competitorDto, facts: z.array(factSchema), manual: z.record(z.string(), z.string()), observedAt: z.string().nullable() })) });
export type Dossier = z.infer<typeof dossierDto>;
export type ResearchOverview = z.infer<typeof overviewDto>;
export type ResearchBriefDto = z.infer<typeof briefDto>;
export type Comparison = z.infer<typeof comparisonDto>;
