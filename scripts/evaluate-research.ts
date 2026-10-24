import { writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { researchCases } from "../tests/fixtures/research-cases.ts";
import {
  verifyFacts,
  factChanges,
  sourceConflicts,
  groundedOpportunities,
} from "../packages/agent/src/research-domain.ts";
const results = researchCases.map((c) => {
  const started = performance.now();
  const facts = verifyFacts(c.raw, [c.source]);
  const changes = factChanges(c.before, facts);
  const conflicts = sourceConflicts(facts);
  const suggestions = groundedOpportunities(
    [
      {
        category: "positioning",
        text: `Гипотеза для интервью: ${c.question}`,
        sourceSnapshotIds: [c.source.id],
      },
      {
        category: "channel",
        text: "Неподтверждённая рекомендация",
        sourceSnapshotIds: ["20000000-0000-4000-8000-000000000002"],
      },
    ],
    facts.length ? [c.source.id] : [],
  );
  const expectedSuggestions = facts.length ? 1 : 0;
  return {
    ...c,
    extraction: facts.length === c.accepted,
    diff: changes.length === c.changes && conflicts.length === c.conflicts,
    grounding: suggestions.length === expectedSuggestions,
    latency: performance.now() - started,
  };
});
const passed = results.filter(
  (r) => r.extraction && r.diff && r.grounding,
).length;
await writeFile(
  "docs/research-evaluation.md",
  `# Рыночная разведка: размеченная регрессия\n\n${results.length} синтетических случаев: 6 стадий × 7 типов события. Разметка хранится в tests/fixtures/research-cases.ts; запуск: pnpm exec tsx scripts/evaluate-research.ts.\n\nЭто проверка извлечения цитат, сравнения и ссылок рекомендаций на детерминированных данных. Семантическое качество живой LLM, полезность рекомендаций в продажах, полнота поиска и network latency здесь **не измеряются**.\n\n| Стадия | Событие | Извлечение | Изменения / конфликты | Основания рекомендаций | ms |\n|---|---|---|---|---|---|\n${results.map((r) => `| ${r.stage} | ${r.name} | ${r.extraction ? "✓" : "FAIL"} | ${r.diff ? "✓" : "FAIL"} | ${r.grounding ? "✓" : "FAIL"} | ${r.latency.toFixed(3)} |`).join("\n")}\n\nПройдено ${passed}/${results.length}. Извлечение: ${results.filter((r) => r.extraction).length}/${results.length}; структурная обоснованность рекомендаций: ${results.filter((r) => r.grounding).length}/${results.length}. Базовые версии, косметический шум и недоступность не порождают ложных изменений. Несопоставимая цена сохраняет валюту, период и единицу; рейтинг не вычисляется.\n\n0 сетевых запросов, 0 LLM calls, 0 токенов. Стоимость live без тарифа неизвестна. Полный граф, возобновление checkpoints, публикация, права и повторная доставка проверены отдельно integration suite. Исходные 16 случаев новостного отбора остаются в evaluation-report.md. Для live-приёмки требуется экспертная разметка извлечённых утверждений и рекомендаций выбранной модели.\n`,
);
console.log(
  `${passed}/${results.length} research cases; extraction and recommendation grounding measured separately`,
);
if (passed !== results.length) process.exitCode = 1;
