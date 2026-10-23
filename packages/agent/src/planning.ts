// Only these public topic terms and explicitly configured search topics may leave via search.
// Internal profile text is used locally to choose categories, never copied into a query.
const vocabulary: [RegExp, string, string][] = [
  [
    /saas|программ|интеграц/i,
    "B2B SaaS API интеграции",
    "B2B SaaS API integrations",
  ],
  [
    /логист|достав|постав/i,
    "логистика поставки изменения",
    "supply chain logistics changes",
  ],
  [
    /товар|магазин|торгов|маркетплейс/i,
    "электронная торговля маркетплейсы",
    "ecommerce marketplace trends",
  ],
  [
    /финанс|платеж/i,
    "финансовые технологии регулирование",
    "fintech regulatory changes",
  ],
  [
    /медицин|здраво/i,
    "медицинские технологии регулирование",
    "healthcare technology regulation",
  ],
  [
    /аналит|отчёт|автомат/i,
    "автоматизация аналитика малый бизнес",
    "business analytics automation",
  ],
  [
    /образован|обучен/i,
    "образовательные технологии рынок",
    "education technology market",
  ],
  [
    /производ|оборудован/i,
    "промышленное оборудование производство",
    "manufacturing equipment industry",
  ],
];
export function publicTopics(fields: unknown): string[] {
  const text = JSON.stringify(fields);
  const selected = vocabulary
    .filter(([pattern]) => pattern.test(text))
    .flatMap(([, ru, en]) => [ru, en]);
  return selected.length
    ? selected.slice(0, 8)
    : ["малый бизнес технологии рынок", "small business technology market"];
}
