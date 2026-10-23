import { writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { demoSources, demoAssessment } from "../packages/agent/src/demo.ts";
import { severity, checkpointer } from "../packages/agent/src/graphs.ts";
import { digest } from "../packages/agent/src/sources.ts";
const to = "2026-10-23T09:00:00Z",
  from = "2026-09-23T09:00:00Z";
const sources = demoSources(to).map((s, i) => ({ ...s, id: "fixture-" + i }));
const cases: [string, string, number, string][] = [
  ["Идея B2B SaaS", "B2B SaaS без выручки", 0, "high"],
  ["Автоматизация", "автоматизация отчётности", 0, "high"],
  ["Аналитика", "аналитика", 0, "high"],
  ["Возможность для бренда", "товарный бренд", 3, "high"],
  ["Магазин", "магазин", 3, "high"],
  ["Продажи", "продажи", 3, "high"],
  ["Риск API", "SaaS интеграции", 1, "verify"],
  ["Риск поставок", "логистика", 2, "verify"],
  ["Товарный бизнес", "поставки товаров", 2, "verify"],
  ["Нерелевантное событие", "кофейня", 0, "low"],
  ["Шум", "SaaS", 4, "low"],
  ["Нет контекста", "", 1, "low"],
  ["Устаревшая новость", "SaaS", 7, "excluded"],
  ["Неизвестная дата", "SaaS", 8, "verify"],
  ["Противоречие источников", "SaaS", 1, "verify"],
  ["Перепечатка", "B2B", 5, "high"],
];
const results = cases.map(([name, description, index, expected]) => {
  const start = performance.now();
  const source = { ...sources[index] };
  if (name === "Противоречие источников") source.relatedSources = [sources[6]];
  const assessment = demoAssessment(source, { stage: "idea", description });
  const stale =
    !!source.publishedAt &&
    (source.publishedAt <= from || source.publishedAt > to);
  const level = severity(assessment),
    actual = stale
      ? "excluded"
      : level === "low"
        ? "low"
        : assessment.confidence === "low"
          ? "verify"
          : level;
  const grounded = assessment.claims.every((c) =>
    c.evidenceIds.every((id) => id === source.id),
  );
  return {
    name,
    expected,
    actual,
    grounded,
    ms: performance.now() - start,
    pass: actual === expected && grounded,
  };
});
const duplicate = digest(sources[0].text) === digest(sources[5].text);
const report = `# Проверка качества demo\n\nФиксированный clock: ${to}; окно (${from}, ${to}]. Собственные синтетические материалы, без сетевых вызовов.\n\nЭто функциональная регрессия детерминированного demo-адаптера, а не измерение качества живой LLM или статистически доказанная точность.\n\n| Профиль и событие | Ожидается | Получено | References существуют | Latency, ms |\n|---|---|---|---|---|\n${results.map((r) => `| ${r.name} | ${r.expected} | ${r.actual} | ${r.grounded ? "да" : "нет"} | ${r.ms.toFixed(3)} |`).join("\n")}\n\nПройдено ${results.filter((r) => r.pass).length}/${results.length}. Перепечатка имеет одинаковый checksum: ${duplicate}; graph объединяет её по event identity. Исправление/конфликт сохраняется отдельной revision и отмечает событие disputed.\n\nВ этих измерениях: 0 LLM calls, 0 search calls, 0 provider tokens. Денежная оценка неизвестна без настроенного тарифа; платные вызовы не выполнялись. Таблица измеряет локальный отбор, не полный network pipeline. Полный graph, PostgreSQL checkpoints, outbox, cursor и повторная доставка проверяются integration suite.\n\nОграничения live: качество семантического объединения и полнота RU/EN поиска требуют отдельной оценки с выбранной моделью; факт существования citation сам по себе не доказывает истинность источника.\n`;
await writeFile("docs/evaluation-report.md", report);
await checkpointer.end();
console.log(
  `${results.filter((r) => r.pass).length}/${results.length} labelled pairs; duplicates=${duplicate}`,
);
if (results.some((r) => !r.pass) || !duplicate) process.exitCode = 1;
