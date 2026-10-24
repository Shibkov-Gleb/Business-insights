import { db } from "./index.ts";
import { companyContextSchema, type CompanyContext, type CorporateFact } from "@context/contracts";
const labels: Record<string, string> = { MAINOKVED_CODE: "ОКВЭД", MAINOKVED_NAME: "Основная деятельность", REVENUE_COMPANY: "Выручка", REGION: "Регион регистрации", CITY: "Город регистрации", ECO_MARK_LABEL: "Стадия из набора", COMPANY_AGE_YEARS_GRADATION: "Возраст", AMOUNT_WORKERS_FNS_GRADATION: "Сотрудники (ФНС)", AMOUNT_WORKERS_SPARK_GRADATION: "Сотрудники (СПАРК)", FTS_FLAG: "Признак ВЭД", FTS_COUNTRY_NAME: "Страны из набора", CL_PRODUCT_RKO_MARK: "РКО", CL_PRODUCT_GAR_MARK: "Гарантии", CL_PRODUCT_LOA_MARK: "Кредиты", CL_PRODUCT_LEA_MARK: "Лизинг", CL_PRODUCT_DEP_MARK: "Депозиты", CL_PRODUCT_ZPP_MARK: "Зарплатный проект", FACTORING_MARK: "Факторинг", NEGATIVEMARK: "Исходный признак NEGATIVEMARK" };
export const companyFieldLabels = labels;
export async function companyContext(companyId: string): Promise<CompanyContext> {
  const company = await db.corporateCompany.findUniqueOrThrow({ where: { id: companyId } });
  const source = company.datasetId ? await db.datasetImport.findUnique({ where: { id: company.datasetId } }) : null;
  const fields = company.fields as Record<string, string>;
  const facts: CorporateFact[] = Object.entries(fields).filter(([key, value]) => !!value && !!labels[key] && !company.conflicts.includes(key)).map(([key, value]) => ({ key, value, origin: company.synthetic ? "synthetic" : "csv", confirmed: true, evidence: { id: `feature:${key}`, kind: company.synthetic ? "synthetic" : "csv", sourceId: source?.id || company.id, quote: value, row: company.sourceRow || undefined, field: key, title: `${source?.filename || "Синтетический профиль"} · ${labels[key]}`, confidence: "verified", historical: false } }));
  const edges = await db.$queryRaw<{ counterparty: string; direction: "incoming" | "outgoing"; amount: string; count: string; share: number; unknownCompany: boolean }[]>`
    WITH edges AS (
      SELECT beneficiary counterparty,'outgoing' direction,sum(amount) amount,sum(count) cnt FROM "PaymentEdge" WHERE payer=${company.externalId} AND beneficiary<>payer GROUP BY beneficiary
      UNION ALL SELECT payer,'incoming',sum(amount),sum(count) FROM "PaymentEdge" WHERE beneficiary=${company.externalId} AND beneficiary<>payer GROUP BY payer
    ), ranked AS (SELECT *, (amount / nullif(sum(amount) OVER (PARTITION BY direction),0))::float share,row_number() OVER(PARTITION BY direction ORDER BY amount DESC,counterparty) rn FROM edges)
    SELECT r.counterparty,r.direction,r.amount::text,r.cnt::text count,coalesce(r.share,0) share,coalesce(c.unknown,true) "unknownCompany" FROM ranked r LEFT JOIN "CorporateCompany" c ON c."externalId"=r.counterparty WHERE rn<=5 ORDER BY direction,amount DESC`;
  const position = company.datasetId && company.revenue ? await db.$queryRaw<{ rank: number; total: number; share: string | null }[]>`SELECT (1+(SELECT count(*) FROM "CorporateCompany" WHERE "datasetId"=${company.datasetId}::uuid AND revenue>${company.revenue}))::int rank,count(*)::int total,(${company.revenue}::numeric/nullif(sum(revenue),0))::text share FROM "CorporateCompany" WHERE "datasetId"=${company.datasetId}::uuid AND NOT unknown` : [];
  const settings = (source?.settings || {}) as Record<string, string>;
  const unknowns = ["Реальная доля рынка неизвестна", "В платёжном наборе нет дат, валюты и назначения платежей", "Связанное лицо не подтверждает владение или контроль", "Регион регистрации не равен географии деятельности", ...(!company.synthetic && settings.revenueUnit !== "RUB" && settings.revenueUnit !== "thousand_RUB" ? ["Единица выручки не подтверждена: значения исходного CSV"] : []), ...company.conflicts.map(x => `Конфликт вариантов: ${labels[x] || x}`)];
  return companyContextSchema.parse({ id: company.id, name: company.name, externalId: company.externalId, groupId: company.groupId, version: company.version, synthetic: company.synthetic, facts, conflicts: company.conflicts, unknowns, dependencies: edges, datasetPosition: { revenueRank: position[0]?.rank || null, companyCount: position[0]?.total || 0, datasetRevenueShare: position[0]?.share || null, realMarketShare: null } });
}
export async function assertCompanyGrant(userId: string, companyId: string, write = false) {
  const grant = await db.companyGrant.findUnique({ where: { userId_companyId: { userId, companyId } } });
  if (!grant || (write && !grant.canEdit)) throw new Error("COMPANY_ACCESS_DENIED");
  return grant;
}
