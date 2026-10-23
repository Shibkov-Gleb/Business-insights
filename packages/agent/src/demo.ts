import type { RetrievedSource } from "./sources.ts";
import type { Assessment } from "@context/contracts";
export function demoSources(to: string): RetrievedSource[] {
  const date = (days: number) =>
    new Date(Date.parse(to) - days * 86400000).toISOString();
  return [
    {
      url: "https://fixtures.example.test/automation",
      title: "Команды малого бизнеса ищут способы автоматизировать отчётность",
      text: "Синтетический пример: небольшие B2B-команды тестируют автоматизацию сбора данных. Участники отмечают потребность в объяснимых отчётах и интеграции с существующими процессами.",
      tags: ["saas", "b2b", "автомат", "аналит", "отчёт"],
      eventKey: "automation",
      publishedAt: date(2),
    },
    {
      url: "https://fixtures.example.test/platform",
      title: "Платформа «Орбита» меняет правила API для интеграций",
      text: "Синтетический пример: платформа «Орбита» объявила обязательный переход интеграций на новый API. Зависимость конкретного проекта от платформы требует подтверждения.",
      tags: ["saas", "интеграц", "платформ", "программ"],
      eventKey: "platform",
      publishedAt: date(4),
    },
    {
      url: "https://fixtures.example.test/logistics",
      title: "Поставщики пересматривают сроки доставки товаров",
      text: "Синтетический пример: поставщики товаров предупредили о перебоях на одном из логистических маршрутов. Затронутые регионы и фактическая зависимость проекта требуют проверки.",
      tags: ["товар", "магазин", "постав", "логист", "торгов"],
      eventKey: "logistics",
      publishedAt: date(1),
    },
    {
      url: "https://fixtures.example.test/market",
      title: "Новый канал продаж для небольших локальных брендов",
      text: "Синтетический пример: маркетплейс «Витрина» открыл тестовую программу для небольших товарных брендов. Участие предполагает проверку условий и спроса.",
      tags: ["товар", "бренд", "продаж", "магазин"],
      eventKey: "market",
      publishedAt: date(3),
    },
    {
      url: "https://fixtures.example.test/noise",
      title: "В городе открылся новый парк",
      text: "Синтетическая общая новость без установленной связи с бизнесом.",
      tags: ["парк"],
      eventKey: "noise",
      publishedAt: date(1),
    },
    {
      url: "https://fixtures.example.test/automation-reprint",
      title: "Перепечатка: команды тестируют автоматизацию отчётности",
      text: "Синтетический пример: небольшие B2B-команды тестируют автоматизацию сбора данных. Участники отмечают потребность в объяснимых отчётах и интеграции с существующими процессами.",
      tags: ["saas", "b2b"],
      eventKey: "automation",
      publishedAt: date(2),
    },
    {
      url: "https://fixtures.example.test/platform-clarification",
      title: "«Орбита» уточняет: обязательность перехода API ещё обсуждается",
      text: "Синтетическое противоречие: первоначальное сообщение об обязательном переходе API не подтверждено. Платформа уточняет, что окончательное решение не принято.",
      tags: ["saas", "интеграц"],
      eventKey: "platform",
      publishedAt: date(1),
    },
    {
      url: "https://fixtures.example.test/stale",
      title: "Архивная программа автоматизации завершена",
      text: "Синтетическая устаревшая новость: программа завершилась, новых условий нет.",
      tags: ["saas", "b2b"],
      eventKey: "stale",
      publishedAt: date(60),
    },
    {
      url: "https://fixtures.example.test/undated",
      title: "Сообщение об изменении интеграций без даты публикации",
      text: "Синтетический материал: поставщик рассматривает изменение интеграций. Дата публикации и сроки неизвестны.",
      tags: ["saas", "интеграц"],
      eventKey: "undated",
      publishedAt: null,
    },
  ].map((x) => ({
    ...x,
    publisher: "Синтетическая редакция · demo",
    language: "ru",
    status: "available",
    synthetic: true,
  }));
}
export function demoAssessment(
  source: RetrievedSource,
  fields: Record<string, unknown>,
): Assessment {
  const context = JSON.stringify(fields).toLowerCase();
  const relevant = source.tags?.some((x) => context.includes(x)) || false;
  const risk = ["platform", "logistics"].includes(source.eventKey || "");
  const conflicts =
    source.relatedSources?.some((s) => s.text.includes("противоречие")) ||
    false;
  return {
    title: source.title,
    summary: source.text,
    why: relevant
      ? "Событие связано с продуктом и зависимостями, указанными в описании проекта. На текущей стадии полезно проверить гипотезу до принятия решения."
      : "Конкретная связь с описанием проекта не установлена.",
    featureRefs: ["description"],
    claims: [
      { text: source.text, classification: "fact", evidenceIds: [source.id!] },
    ],
    risks: risk
      ? [
          "Возможное влияние на сроки и совместимость; фактическая зависимость ещё не подтверждена.",
        ]
      : [],
    opportunities: risk
      ? []
      : [
          "Проверить спрос на решение на небольшой группе потенциальных клиентов.",
        ],
    actions: [
      "Сопоставить событие с текущими гипотезами проекта.",
      "Провести короткие интервью с целевой аудиторией.",
    ],
    unknowns: [
      "Данные синтетические. Реальное влияние и размер эффекта не оценивались.",
    ],
    horizon: "Ближайший цикл проверки гипотез",
    relevance: relevant ? 4 : 1,
    impact: relevant ? 4 : 1,
    urgency: 3,
    confidence: risk || !source.publishedAt || conflicts ? "low" : "medium",
    confidenceReason: source.synthetic
      ? "Синтетический fixture: демонстрация механики, не вывод о реальном рынке."
      : "Основания ограничены.",
    dependencyConfirmed: false,
    conflicts,
    correctsPrevious: false,
    changeSummary: conflicts
      ? "Источники расходятся в обязательности изменения; нужно подтверждение платформы."
      : "",
  };
}
