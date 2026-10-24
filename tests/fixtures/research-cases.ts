import { stageQuestions, type ResearchFact } from "@context/contracts";
const sourceId = "10000000-0000-4000-8000-000000000001";
const observedAt = "2026-10-24T00:00:00Z";
const oldQuote = "Тариф: 10 USD за рабочее пространство в месяц, до 5 человек.";
const fact: ResearchFact = {
  field: "pricing",
  value: oldQuote,
  classification: "company_claim",
  sourceSnapshotId: sourceId,
  quote: oldQuote,
  observedAt,
  price: {
    amount: "10",
    currency: "USD",
    period: "month",
    unit: "workspace",
    conditions: "До 5 человек",
  },
};
const next = {
  ...fact,
  value: oldQuote.replace("10 USD", "20 USD"),
  quote: oldQuote.replace("10 USD", "20 USD"),
  price: { ...fact.price!, amount: "20" },
};
const variants = [
  {
    name: "Первое наблюдение, функция не упомянута",
    before: [],
    raw: [fact],
    text: oldQuote,
    accepted: 1,
    changes: 0,
    conflicts: 0,
  },
  {
    name: "Оформление и пробелы, условия прежние",
    before: [fact],
    raw: [{ ...fact, value: "  " + oldQuote.replaceAll(" ", "  ") }],
    text: oldQuote,
    accepted: 1,
    changes: 0,
    conflicts: 0,
  },
  {
    name: "Изменение тарифа с двумя цитатами",
    before: [fact],
    raw: [next],
    text: next.quote,
    accepted: 1,
    changes: 1,
    conflicts: 0,
  },
  {
    name: "Противоречивые условия в двух заявлениях",
    before: [fact],
    raw: [fact, next],
    text: oldQuote + "\n" + next.quote,
    accepted: 2,
    changes: 0,
    conflicts: 1,
  },
  {
    name: "Придуманная цитата и недостаточные основания",
    before: [fact],
    raw: [next],
    text: oldQuote,
    accepted: 0,
    changes: 0,
    conflicts: 0,
  },
  {
    name: "Страница недоступна, исчезновение не утверждается",
    before: [fact],
    raw: [],
    text: "",
    accepted: 0,
    changes: 0,
    conflicts: 0,
  },
  {
    name: "Новая валюта и годовая оплата, без рейтинга дешевизны",
    before: [fact],
    raw: [
      {
        ...next,
        value: "200 EUR за пользователя в год",
        quote: "200 EUR за пользователя в год",
        price: {
          amount: "200",
          currency: "EUR",
          period: "year",
          unit: "user",
          conditions: "Минимум 10 пользователей",
        },
      },
    ],
    text: "200 EUR за пользователя в год",
    accepted: 1,
    changes: 1,
    conflicts: 0,
  },
] satisfies {
  name: string;
  before: ResearchFact[];
  raw: ResearchFact[];
  text: string;
  accepted: number;
  changes: number;
  conflicts: number;
}[];
export const researchCases = Object.entries(stageQuestions).flatMap(
  ([stage, question]) =>
    variants.map((v, index) => ({
      ...v,
      id: `${stage}-${index + 1}`,
      stage,
      question,
      source: { id: sourceId, text: v.text, observedAt },
    })),
);
