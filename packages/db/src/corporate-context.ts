import { db } from "./index.ts";
import {
  companyContextSchema,
  corporateFieldLabels,
  type CompanyContext,
  type CorporateFact,
} from "@context/contracts";
import { z } from "zod";
const labels = corporateFieldLabels;
export const companyFieldLabels = labels;
export async function companyContext(
  companyId: string,
  userId?: string,
): Promise<CompanyContext> {
  const company = await db.corporateCompany.findUniqueOrThrow({
    where: { id: companyId },
  });
  const source = company.datasetId
    ? await db.datasetImport.findUnique({ where: { id: company.datasetId } })
    : null;
  const fields = company.fields as Record<string, string>;
  const overrides = z
    .record(
      z.string(),
      z.object({
        value: z.string(),
        confirmedBy: z.string(),
        version: z.number(),
        confirmedAt: z.string(),
      }),
    )
    .parse((company.fields as Record<string, unknown>)._overrides || {});
  const facts: CorporateFact[] = Object.entries(fields)
    .filter(
      ([key, value]) =>
        !!value && !!labels[key] && !company.conflicts.includes(key),
    )
    .map(([key, value]) => ({
      key,
      value,
      origin: company.synthetic ? "synthetic" : "csv",
      confirmed: true,
      evidence: {
        id: `feature:${key}`,
        kind: company.synthetic ? "synthetic" : "csv",
        sourceId: source?.id || company.id,
        quote: value,
        row: company.sourceRow || undefined,
        field: key,
        title: `${source?.filename || "Синтетический профиль"} · ${labels[key]}`,
        confidence: "verified",
        historical: false,
      },
    }));
  for (const [key, override] of Object.entries(overrides)) {
    const index = facts.findIndex((x) => x.key === key);
    if (index >= 0) facts.splice(index, 1);
    facts.push({
      key,
      value: override.value,
      origin: "user",
      confirmed: true,
      evidence: {
        id: `feature:${key}`,
        kind: "user",
        sourceId: company.id,
        quote: override.value,
        field: key,
        title: `Подтверждено пользователем · ${labels[key] || key} · v${override.version}`,
        publishedAt: override.confirmedAt,
        confidence: "verified",
        historical: false,
      },
    });
  }
  const edges = await db.$queryRaw<
    {
      counterparty: string;
      direction: "incoming" | "outgoing";
      amount: string;
      count: string;
      share: number;
      unknownCompany: boolean;
    }[]
  >`
    WITH edges AS (
      SELECT beneficiary counterparty,'outgoing' direction,sum(amount) amount,sum(count) cnt FROM "PaymentEdge" WHERE payer=${company.externalId} AND beneficiary<>payer GROUP BY beneficiary
      UNION ALL SELECT payer,'incoming',sum(amount),sum(count) FROM "PaymentEdge" WHERE beneficiary=${company.externalId} AND beneficiary<>payer GROUP BY payer
    ), ranked AS (SELECT *, (amount / nullif(sum(amount) OVER (PARTITION BY direction),0))::float share,row_number() OVER(PARTITION BY direction ORDER BY amount DESC,counterparty) rn FROM edges)
    SELECT r.counterparty,r.direction,r.amount::text,r.cnt::text count,coalesce(r.share,0) share,coalesce(c.unknown,true) "unknownCompany" FROM ranked r LEFT JOIN "CorporateCompany" c ON c."externalId"=r.counterparty WHERE rn<=5 ORDER BY r.direction,r.amount DESC`;
  const position =
    company.datasetId && company.revenue
      ? await db.$queryRaw<
          { rank: number; total: number; share: string | null }[]
        >`SELECT (1+(SELECT count(*) FROM "CorporateCompany" WHERE "datasetId"=${company.datasetId}::uuid AND revenue>${company.revenue}))::int rank,count(*)::int total,(${company.revenue}::numeric/nullif(sum(revenue),0))::text share FROM "CorporateCompany" WHERE "datasetId"=${company.datasetId}::uuid AND NOT unknown AND revenue IS NOT NULL`
      : [];
  for (const direction of ["incoming", "outgoing"] as const) {
    const largest = edges.find((x) => x.direction === direction);
    if (!largest) continue;
    const key = `payment_concentration_${direction}`,
      value = `${(largest.share * 100).toFixed(4)}% доступной суммы ${direction === "incoming" ? "входящих" : "исходящих"} связей`;
    facts.push({
      key,
      value,
      confirmed: true,
      origin: "calculation",
      evidence: {
        id: `feature:${key}`,
        kind: "calculation",
        sourceId: company.id,
        field: key,
        quote: value,
        title: "Расчёт концентрации доступных платёжных связей",
        confidence: "verified",
        historical: false,
      },
    });
  }
  const relatedPersonCount = await db.personCompanyLink.count({
    where: { companyExternalId: company.externalId },
  });
  let group: CompanyContext["group"] = null;
  if (userId && company.groupId) {
    const grants = await db.companyGrant.findMany({
      where: { userId },
      select: { companyId: true },
    });
    const members = await db.corporateCompany.findMany({
      where: {
        groupId: company.groupId,
        id: { in: grants.map((g) => g.companyId) },
      },
      select: { id: true, revenue: true },
    });
    group = {
      id: company.groupId,
      allowedCompanyIds: members.map((x) => x.id),
      revenueSumRaw: members
        .reduce(
          (sum, x) => sum.add(x.revenue || 0),
          new (await import("./index.ts")).Prisma.Decimal(0),
        )
        .toString(),
      label:
        "Сумма исходных выручек разрешённых компаний, не консолидированная выручка; единицы требуют проверки",
    };
  }
  const settings = (source?.settings || {}) as Record<string, string>;
  const unknowns = [
    "Реальная доля рынка неизвестна",
    "В платёжном наборе нет дат, валюты и назначения платежей",
    "Связанное лицо не подтверждает владение или контроль",
    "Регион регистрации не равен географии деятельности",
    ...(!company.synthetic &&
    settings.revenueUnit !== "RUB" &&
    settings.revenueUnit !== "thousand_RUB"
      ? ["Единица выручки не подтверждена: значения исходного CSV"]
      : []),
    ...company.conflicts.map((x) => `Конфликт вариантов: ${labels[x] || x}`),
    ...Object.entries(labels)
      .filter(
        ([key]) =>
          !fields[key] && !overrides[key] && !company.conflicts.includes(key),
      )
      .map(([, label]) => `Нет данных: ${label}`),
  ];
  return companyContextSchema.parse({
    id: company.id,
    name: company.name,
    externalId: company.externalId,
    groupId: company.groupId,
    group,
    relatedPersonCount,
    version: company.version,
    synthetic: company.synthetic,
    facts: facts.sort((a, b) => {
      const order = Object.keys(labels),
        left = order.indexOf(a.key),
        right = order.indexOf(b.key);
      return (left < 0 ? 999 : left) - (right < 0 ? 999 : right);
    }),
    conflicts: company.conflicts.filter((k) => !overrides[k]),
    unknowns,
    dependencies: edges,
    datasetPosition: {
      revenueRank: position[0]?.rank || null,
      companyCount: position[0]?.total || 0,
      datasetRevenueShare: position[0]?.share || null,
      realMarketShare: null,
    },
  });
}
export async function assertCompanyGrant(
  userId: string,
  companyId: string,
  write = false,
) {
  const grant = await db.companyGrant.findUnique({
    where: { userId_companyId: { userId, companyId } },
  });
  if (!grant || (write && !grant.canEdit))
    throw new Error("COMPANY_ACCESS_DENIED");
  return grant;
}
