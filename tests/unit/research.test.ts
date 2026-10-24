import { describe, it, expect } from "vitest";
import {
  researchInput,
  manualFactsInput,
  type ResearchFact,
  stageQuestions,
} from "@context/contracts";
import {
  verifyFacts,
  factChanges,
  sourceConflicts,
} from "../../packages/agent/src/research-domain.ts";
const id = "10000000-0000-4000-8000-000000000001";
const time = "2026-10-24T00:00:00Z";
const fact: ResearchFact = {
  field: "pricing",
  value: "10 USD / месяц",
  classification: "company_claim",
  sourceSnapshotId: id,
  quote: "Тариф стоит 10 USD в месяц",
  observedAt: time,
  price: {
    amount: "10",
    currency: "USD",
    period: "month",
    unit: "workspace",
    conditions: "Без НДС",
  },
};
describe("research evidence", () => {
  it("requires an actual quote and server observation date", () => {
    expect(
      verifyFacts([fact], [{ id, text: fact.quote, observedAt: time }]),
    ).toHaveLength(1);
    expect(
      verifyFacts(
        [{ ...fact, quote: "Придуманное основание" }],
        [{ id, text: fact.quote, observedAt: time }],
      ),
    ).toEqual([]);
    expect(
      verifyFacts(
        [{ ...fact, classification: "user" }],
        [{ id, text: fact.quote, observedAt: time }],
      ),
    ).toEqual([]);
  });
  it("baseline, whitespace and unavailable source do not imply changes", () => {
    expect(factChanges([], [fact])).toEqual([]);
    expect(
      factChanges([fact], [{ ...fact, value: " 10  USD / месяц " }]),
    ).toEqual([]);
    expect(factChanges([fact], [])).toEqual([]);
  });
  it("keeps both pieces of evidence for a changed price", () => {
    const next = {
      ...fact,
      value: "20 USD / месяц",
      price: { ...fact.price!, amount: "20" },
    };
    expect(factChanges([fact], [next])).toEqual([
      { field: "pricing", before: fact, after: next },
    ]);
    expect(sourceConflicts([fact, next])).toEqual(["pricing"]);
    expect(factChanges([fact], [fact, next])).toEqual([]);
  });
  it("limits competitors and supports all stages", () => {
    expect(
      manualFactsInput.safeParse({
        expectedVersion: 1,
        fields: { pricing: "Уточнение" },
      }).success,
    ).toBe(true);
    expect(researchInput.safeParse({ competitorIds: [id, id] }).success).toBe(
      false,
    );
    expect(Object.keys(stageQuestions)).toHaveLength(6);
  });
});
