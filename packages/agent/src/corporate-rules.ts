import type {
  CompanyContext,
  CorporateAssessment,
  CorporateEvidence,
  WorkRole,
} from "@context/contracts";
import { normalizeQuote } from "./bank-corpus.ts";
export const roleChannels: Record<WorkRole, string[]> = {
  owner: ["strategy", "demand", "financing"],
  ceo: ["strategy", "supply", "demand"],
  cfo: ["financing", "liquidity", "fx"],
  accountant: ["regulation"],
  treasurer: ["liquidity", "fx", "financing"],
  executive: ["strategy", "supply"],
  employee: ["demand", "supply"],
};
export function personalScore(
  a: CorporateAssessment,
  role: WorkRole,
  interests: string[],
) {
  return (
    a.relevance * 100 +
    a.impact * 20 +
    a.urgency * 5 +
    a.channels.filter((x) => roleChannels[role].includes(x)).length * 18 +
    a.channels.filter((x) => interests.includes(x)).length * 12
  );
}
// Public vocabulary is deliberately assembled from non-sensitive categorical fields only.
export function corporateQueries(context: CompanyContext) {
  const activity =
    context.facts.find((x) => x.key === "MAINOKVED_NAME")?.value ||
    "экономика России";
  const safeActivity = activity
    .replace(/[^\p{L}\s-]/gu, " ")
    .trim()
    .slice(0, 130);
  const queries = [
    `${safeActivity} новости спрос поставки Россия`,
    `${safeActivity} регулирование новости`,
  ];
  if (
    context.facts.some(
      (x) => x.key === "CL_PRODUCT_LOA_MARK" && x.value === "1.0",
    )
  )
    queries.push("ключевая ставка кредитование корпоративный сектор новости");
  if (context.facts.some((x) => x.key === "FTS_FLAG" && x.value === "1.0"))
    queries.push("валютные расчеты логистика внешняя торговля Россия новости");
  return queries;
}
export function verifyCorporateAssessment(
  a: CorporateAssessment,
  context: CompanyContext,
  evidence: CorporateEvidence[],
  newsText: string,
) {
  const errors: string[] = [],
    byId = new Map(evidence.map((x) => [x.id, x]));
  const known = new Set(
    context.facts
      .filter((x) => x.confirmed && !context.conflicts.includes(x.key))
      .map((x) => x.key),
  );
  if (a.companyFeatureKeys.some((k) => !known.has(k)))
    errors.push("UNKNOWN_COMPANY_FEATURE");
  for (const id of a.externalEvidenceIds) {
    const e = byId.get(id);
    if (
      !e ||
      e.kind !== "news" ||
      !normalizeQuote(newsText).includes(normalizeQuote(e.quote))
    )
      errors.push("INVALID_NEWS_QUOTE");
  }
  if (a.bankView)
    for (const id of a.bankView.evidenceIds) {
      const e = byId.get(id);
      if (
        !e ||
        e.kind !== "bank" ||
        e.confidence !== "verified" ||
        e.historical ||
        !e.publishedAt ||
        !e.page
      )
        errors.push("INVALID_BANK_ATTRIBUTION");
    }
  if (a.bankView && !a.bankView.text.trim()) errors.push("EMPTY_BANK_VIEW");
  if (a.bankView && !a.bankView.evidenceIds.length)
    errors.push("BANK_WITHOUT_EVIDENCE");
  return [...new Set(errors)];
}
export function deterministicAssessment(
  context: CompanyContext,
  title: string,
  text: string,
  bank: CorporateEvidence[],
): CorporateAssessment {
  const rate = /ставк|кредит|денежно|инфляц/i.test(title + " " + text),
    fx = /валют|курс|логист|экспорт|импорт/i.test(title + " " + text),
    tax = /налог|отч[её]т|НДС|бухгалтер/i.test(title + " " + text);
  const debt = context.facts.some(
      (x) => x.key === "CL_PRODUCT_LOA_MARK" && x.value === "1.0",
    ),
    trade = context.facts.some(
      (x) => x.key === "FTS_FLAG" && x.value === "1.0",
    );
  const feature =
    context.facts.find(
      (x) =>
        x.key ===
        (rate ? "CL_PRODUCT_LOA_MARK" : fx ? "FTS_FLAG" : "MAINOKVED_NAME"),
    ) || context.facts[0];
  const matching = bank.find(
    (x) => x.confidence === "verified" && !x.historical,
  );
  const concentrated = context.dependencies.some((x) => x.share >= 0.4);
  const activity =
    context.facts.find((x) => x.key === "MAINOKVED_NAME")?.value || "";
  const allText = title + " " + text;
  const noise = /футбол|турнир|премьера фильма/i.test(allText);
  const steel = /сталь|стали|прокат|металлург/i.test(allText),
    food = /пищев|продовольств/i.test(allText),
    payment = /плат[её]ж|контрагент|поставщик/i.test(allText);
  const relevance = noise
    ? 1
    : rate
      ? debt
        ? 5
        : 2
      : fx
        ? trade
          ? 5
          : 2
        : tax
          ? 4
          : steel
            ? /стал|металл|прокат/i.test(activity)
              ? 4
              : 1
            : food
              ? /пищев|продовольств/i.test(activity)
                ? 4
                : 2
              : payment
                ? concentrated
                  ? 4
                  : 2
                : 3;
  return {
    title,
    what: text.slice(0, 450),
    why: rate
      ? debt
        ? "В профиле подтверждён банковский кредит. Изменение денежно-кредитных условий может затронуть рефинансирование и новые заимствования; условия действующих договоров неизвестны."
        : "В наборе нет признака банковского кредита. Прямой процентный эффект не подтверждён; возможен косвенный эффект через спрос и контрагентов."
      : fx
        ? trade
          ? "Подтверждён признак ВЭД, но направление торговли и валюты неизвестны. Событие требует проверки расчётных и логистических зависимостей."
          : "Признак ВЭД в профиле отсутствует. Прямая валютная экспозиция не доказана."
        : `Сопоставлено с видом деятельности компании.${concentrated ? " В доступных платёжных связях есть концентрация; она усиливает необходимость проверки контрагента, но не доказывает операционную зависимость." : ""}`,
    companyFeatureKeys: feature ? [feature.key] : ["MAINOKVED_NAME"],
    externalEvidenceIds: ["news"],
    bankView: matching
      ? {
          text: "В релевантном банковском материале найден следующий тезис; точная цитата и дата приведены в основаниях. Это авторская аналитика документа, а не одобрение рекомендации AI.",
          evidenceIds: [matching.id],
        }
      : null,
    consequences: [
      rate && debt
        ? "Возможное изменение стоимости новых заимствований и рефинансирования; величина эффекта без условий договоров неизвестна."
        : fx && trade
          ? "Возможные задержки расчётов или поставок; требуется проверить фактические маршруты и валюты."
          : "Возможное влияние на спрос, оборотный капитал или цепочку поставок; причинность требует проверки.",
    ],
    checks: [
      rate && debt
        ? "Сверить даты рефинансирования, фиксированные и плавающие условия договоров, провести сценарий денежных потоков."
        : tax
          ? "Уточнить применимость нормы к организации и сроки изменения учётных процедур."
          : "Проверить применимость события к ключевым договорам, клиентам и поставщикам.",
    ],
    unknowns: [
      "Детерминированный демонстрационный анализ; живая LLM не использовалась",
      ...(!matching
        ? ["Подходящая актуальная и проверенная позиция банка не найдена"]
        : []),
      ...(rate
        ? ["Ставки, даты и условия кредитных договоров отсутствуют"]
        : []),
    ],
    channels: rate
      ? ["financing", "liquidity"]
      : fx
        ? ["fx", "supply"]
        : tax
          ? ["regulation"]
          : [
              "demand",
              "strategy",
              ...(concentrated ? ["supply" as const] : []),
            ],
    relevance,
    impact: relevance >= 4 ? 4 : 2,
    urgency: 3,
    confidence: matching && relevance >= 4 ? "medium" : "low",
    category: relevance >= 4 ? "risk" : "background",
  };
}
