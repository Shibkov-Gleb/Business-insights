import fs from "node:fs/promises";
import { performance } from "node:perf_hooks";
import {
  companyContextSchema,
  corporateAssessment,
  type CorporateEvidence,
  type WorkRole,
} from "@context/contracts";
import {
  deterministicAssessment,
  personalScore,
  verifyCorporateAssessment,
  eventFingerprint,
} from "../packages/agent/src/corporate-rules.ts";
import { normalizeQuote } from "../packages/agent/src/bank-corpus.ts";
type Case = {
  id: string;
  split: "development" | "heldout";
  profile: string;
  context: unknown;
  event: { title: string; text: string; identity: string };
  role: WorkRole;
  relevant: boolean;
  bank: { text: string; evidence: CorporateEvidence } | null;
  labelNote: string;
};
const cases: Case[] = JSON.parse(
  await fs.readFile("data/hackathon/evaluation.json", "utf8"),
);
const results = [];
for (const c of cases) {
  const context = companyContextSchema.parse(c.context),
    start = performance.now();
  const bank = c.bank ? [c.bank.evidence] : [];
  const data = corporateAssessment.parse(
    deterministicAssessment(context, c.event.title, c.event.text, bank),
  );
  const evidence: CorporateEvidence[] = [
    {
      id: "news",
      kind: "news",
      sourceId: c.id,
      quote: c.event.text.slice(0, 900),
      title: c.event.title,
      confidence: "verified",
      historical: false,
    },
    ...context.facts.map((x) => x.evidence),
    ...bank,
  ];
  const errors = verifyCorporateAssessment(
    data,
    context,
    evidence,
    c.event.text,
  );
  const citedBank = evidence.filter((e) =>
    data.bankView?.evidenceIds.includes(e.id),
  );
  const valid =
    errors.length === 0 &&
    citedBank.every(
      (e) =>
        c.bank && normalizeQuote(c.bank.text).includes(normalizeQuote(e.quote)),
    );
  const falseBank = citedBank.some(
    (e) =>
      e.historical ||
      e.confidence !== "verified" ||
      !c.bank ||
      !normalizeQuote(c.bank.text).includes(normalizeQuote(e.quote)),
  );
  results.push({
    id: c.id,
    split: c.split,
    profile: c.profile,
    identity: eventFingerprint(c.event.text),
    expectedIdentity: c.event.identity,
    relevant: c.relevant,
    score: personalScore(data, c.role, []),
    valid,
    falseBank,
    elapsedMs: performance.now() - start,
    bankUsed: !!data.bankView,
  });
}
const metrics = (split: string) => {
  const rows = results.filter((r) => r.split === split),
    precision = [];
  for (const profile of [...new Set(rows.map((r) => r.profile))]) {
    const seen = new Set<string>(),
      ranked = rows
        .filter((r) => r.profile === profile)
        .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
        .filter((r) => {
          if (seen.has(r.identity)) return false;
          seen.add(r.identity);
          return true;
        })
        .slice(0, 5);
    precision.push(
      ranked.filter((r) => r.relevant).length / Math.min(5, ranked.length),
    );
  }
  return {
    cases: rows.length,
    precisionAt5: precision.reduce((a, b) => a + b, 0) / precision.length,
    validReferences: rows.filter((r) => r.valid).length / rows.length,
    falseBankAttributions: rows.filter((r) => r.falseBank).length,
    bankUsed: rows.filter((r) => r.bankUsed).length,
    duplicatePairs:
      rows.length - new Set(rows.map((r) => r.profile + ":" + r.identity)).size,
    meanLatencyMs: rows.reduce((s, r) => s + r.elapsedMs, 0) / rows.length,
  };
};
const report = {
  generatedAt: new Date().toISOString(),
  mode: "deterministic-fixture",
  labels: "Авторская разметка, не экспертная оценка банка",
  development: metrics("development"),
  heldout: metrics("heldout"),
  semanticRecommendationGrounding: null,
  liveExtractionQuality: null,
  bankRetrievalMeasured: false,
  paidCalls: 0,
  rubCost: "0",
  liveAcceptance: false,
  limitations: [
    "Детерминированные правила проверяют продуктовые контракты, а не качество Gemma/GLM",
    "Отложено 20 сочетаний, но авторская разметка не является независимой экспертизой",
    "Латентность не включает сеть или живую LLM",
    "Семантическую обоснованность и банковскую атрибуцию требуется повторно оценить с моделями организаторов",
  ],
  cases: results,
};
await fs.writeFile(
  "docs/hackathon-evaluation.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    development: report.development,
    heldout: report.heldout,
    liveAcceptance: false,
  }),
);
if (
  report.heldout.validReferences !== 1 ||
  report.heldout.falseBankAttributions !== 0 ||
  report.heldout.precisionAt5 < 0.8
)
  process.exitCode = 1;
