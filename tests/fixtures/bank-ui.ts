/** Synthetic UI fixtures. No CSV, private document, key or real bank position. */
import {
  companyContextSchema,
  corporateCompanyItem,
  corporateInsightSchema,
  corporateRunSchema,
  hackathonIntegrationSchema,
  bankMaterialSchema,
} from "@context/contracts";
export const companyId = "11111111-1111-4111-8111-111111111111";
const runId = "22222222-2222-4222-8222-222222222222";
const materialId = "33333333-3333-4333-8333-333333333333";
const date = "2026-10-26T09:00:00.000Z";
export const company = corporateCompanyItem.parse({
  id: companyId,
  externalId: "ui-synthetic",
  name: "Северный металл · синтетический",
  industry: "Металлургия",
  groupId: "Учебная группа",
  synthetic: true,
  version: 1,
  conflicts: [],
  grant: { role: "cfo", canEdit: false, interests: ["financing", "supply"] },
});
const evidence = {
  id: "news-ui",
  kind: "news" as const,
  sourceId: "ui-news",
  quote:
    "Учебное событие: условия финансирования меняются, конкретные договоры требуют отдельной проверки.",
  title: "Синтетическая новость для проверки интерфейса",
  publishedAt: date,
  confidence: "verified" as const,
  historical: false,
};
const bankEvidence = {
  id: "bank-ui",
  kind: "bank" as const,
  sourceId: materialId,
  page: 1,
  quote:
    "Синтетический пример цитаты для проверки интерфейса. Это не позиция Альфа-Банка.",
  title: "Учебный документ · синтетический",
  publishedAt: date,
  confidence: "unknown" as const,
  historical: false,
};
const feature = {
  id: "feature-ui",
  kind: "synthetic" as const,
  sourceId: companyId,
  quote: "CL_PRODUCT_LOA_MARK: 1.0",
  title: "Синтетический профиль · Кредиты",
  confidence: "verified" as const,
  historical: false,
};
export const context = companyContextSchema.parse({
  ...company,
  facts: [
    {
      key: "REVENUE_COMPANY",
      value: "23000000000",
      origin: "synthetic",
      confirmed: true,
      evidence: {
        ...feature,
        id: "revenue-ui",
        title: "Синтетический профиль · Выручка",
        quote: "REVENUE_COMPANY: 23000000000",
      },
    },
    {
      key: "MAINOKVED_NAME",
      value: "Производство стали",
      origin: "synthetic",
      confirmed: true,
      evidence: {
        ...feature,
        id: "industry-ui",
        title: "Синтетический профиль · Деятельность",
        quote: "MAINOKVED_NAME: Производство стали",
      },
    },
    {
      key: "CL_PRODUCT_LOA_MARK",
      value: "1.0",
      origin: "synthetic",
      confirmed: true,
      evidence: feature,
    },
    {
      key: "REGION",
      value: "Свердловская область",
      origin: "synthetic",
      confirmed: true,
      evidence: {
        ...feature,
        id: "region-ui",
        title: "Синтетический профиль · Регион",
        quote: "REGION: Свердловская область",
      },
    },
  ],
  unknowns: [
    "Ставки и сроки действующих кредитов неизвестны.",
    "Реальная доля рынка не определена.",
  ],
  dependencies: [
    {
      counterparty: "Учебный поставщик",
      direction: "outgoing",
      amount: "125000000.01",
      count: "42",
      share: 0.38,
      unknownCompany: true,
    },
  ],
  datasetPosition: {
    revenueRank: null,
    companyCount: 0,
    datasetRevenueShare: null,
    realMarketShare: null,
  },
});
export const insights = [
  [
    "Стоимость финансирования: что проверить перед новым кредитным циклом",
    "risk",
    "financing",
  ],
  [
    "Новые условия поставок: устойчивость цепочки важнее разовой экономии",
    "mixed",
    "supply",
  ],
  [
    "Промышленный спрос: повод пересмотреть сценарий продаж",
    "opportunity",
    "demand",
  ],
].map(([title, category, channel], index) =>
  corporateInsightSchema.parse({
    id: `44444444-4444-4444-8444-44444444444${index}`,
    companyId,
    runId,
    createdAt: date,
    contextVersion: 1,
    score: 90 - index * 10,
    synthetic: true,
    data: {
      title,
      what: evidence.quote,
      why: "В синтетическом профиле компании есть кредитные обязательства и зависимость от поставщиков. Изменения на рынке могут повлиять на будущие условия финансирования и потребность в оборотном капитале.",
      companyFeatureKeys: ["CL_PRODUCT_LOA_MARK"],
      externalEvidenceIds: [evidence.id],
      bankView:
        index === 0
          ? {
              text: "Учебный пример отображения банковской цитаты; реальная позиция банка здесь не моделируется.",
              evidenceIds: [bankEvidence.id],
            }
          : null,
      consequences: [
        "Возможна потребность в уточнении финансового плана. Конкретный эффект требует проверки договоров.",
      ],
      checks: [
        "Уточнить сроки ближайшего рефинансирования и условия договоров.",
        "Сопоставить запас ликвидности с плановыми платежами.",
      ],
      unknowns: ["Фактические ставки и ковенанты компании неизвестны."],
      channels: [channel],
      relevance: 5,
      impact: 4,
      urgency: 3,
      confidence: "medium",
      category,
    },
    evidence: [evidence, bankEvidence, feature],
  }),
);
export const run = corporateRunSchema.parse({
  id: runId,
  status: "succeeded",
  kind: "corporate",
  acceptedAt: date,
  finishedAt: date,
  error: null,
  coverage: { synthetic: true },
  budget: { paidCalls: 0 },
});
export const material = bankMaterialSchema.parse({
  id: materialId,
  title: bankEvidence.title,
  filename: "synthetic-ui.pdf",
  publishedAt: date,
  dateStatus: "synthetic",
  status: "synthetic",
  pages: 1,
  sha256: "0".repeat(64),
  coverage: { synthetic: true },
});
export const integration = hackathonIntegrationSchema.parse({
  mode: "demo",
  readiness: {
    ready: false,
    extract: null,
    reason: null,
    error: "Изолированный UI-стенд: внешние вызовы отключены",
  },
  families: [],
  modeled: ["UI fixture"],
  missingMaterials: [],
  autonomousPaidRuns: false,
  budget: {
    day: "2026-10-26",
    timezone: "Europe/Moscow",
    resetHour: 3,
    capRub: "500",
    spentRub: "0",
    reservedRub: "0",
    remainingRub: "500",
    pricingKnown: false,
  },
});
export function fixtureResponse(path: string): unknown | undefined {
  if (path === "/api/v1/config/public")
    return { mode: "demo", variant: "alfa" };
  if (path === "/api/v1/auth/csrf") return { csrfToken: "ui-only" };
  if (path === "/api/v1/bank/companies")
    return { items: [company], nextCursor: null };
  if (path === "/api/v1/bank/integration") return integration;
  if (path === "/api/v1/bank/imports") return { items: [], nextCursor: null };
  if (path === "/api/v1/bank/groups")
    return {
      items: [
        {
          groupId: company.groupId,
          warning: "Синтетический набор для UI. Не консолидированная выручка.",
          companies: [
            {
              id: companyId,
              name: company.name,
              revenue: "23000000000",
              synthetic: true,
            },
          ],
        },
      ],
    };
  if (path === "/api/v1/bank/materials")
    return { items: [material], nextCursor: null };
  if (path.endsWith("/pages/1"))
    return {
      id: materialId,
      materialId,
      page: 1,
      text: bankEvidence.quote,
      method: "synthetic",
      quality: 100,
      numericVerified: false,
      boxes: [],
    };
  if (path.endsWith("/context")) return context;
  if (path.endsWith("/feed")) return { items: insights, nextCursor: null };
  if (path.endsWith("/runs")) return { items: [run], nextCursor: null };
  if (path.endsWith("/feedback")) return { items: [], nextCursor: null };
  if (path.endsWith("/chats")) return { items: [], nextCursor: null };
  if (path.endsWith("/trace")) return { run, items: [] };
  if (path.endsWith("/evidence"))
    return { synthetic: true, text: evidence.quote };
  if (path.endsWith("/revisions")) return { items: [], nextCursor: null };
  return insights.find((i) => path.endsWith("/insights/" + i.id));
}
