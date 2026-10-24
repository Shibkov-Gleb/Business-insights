import { factSchema, type ResearchFact } from "@context/contracts";
const normalized = (s: string) => s.normalize("NFKC").replace(/\s+/g, " ").trim();
export function verifyFacts(raw: unknown[], sources: { id: string; text: string; observedAt: string }[]) {
  const result: ResearchFact[] = [];
  for (const value of raw) {
    const parsed = factSchema.safeParse(value);
    if (!parsed.success) continue;
    const fact = parsed.data;
    const source = sources.find(s => s.id === fact.sourceSnapshotId);
    // Models cannot claim user approval or manufacture an observation timestamp.
    if (!source || fact.classification === "user" || normalized(fact.quote).length < 12 || !normalized(source.text).includes(normalized(fact.quote))) continue;
    result.push({ ...fact, observedAt: source.observedAt });
  }
  return result;
}
export function factChanges(before: ResearchFact[], after: ResearchFact[]) {
  return after.flatMap(fact => {
    const previous = before.filter(p => p.field === fact.field);
    const current = after.filter(p => p.field === fact.field);
    // Multiple claims are an explicit conflict, not an authoritative new value.
    if (previous.length !== 1 || current.length !== 1 || fact.classification === "hypothesis" || previous[0].classification === "hypothesis") return [];
    const equal = (a: ResearchFact, b: ResearchFact) => normalized(a.value).toLowerCase() === normalized(b.value).toLowerCase() && JSON.stringify(a.price) === JSON.stringify(b.price);
    return equal(previous[0], fact) ? [] : [{ field: fact.field, before: previous[0], after: fact }];
  });
}
export function sourceConflicts(facts: ResearchFact[]) {
  return [...new Set(facts.filter(f => facts.some(other => other.field === f.field && normalized(other.value) !== normalized(f.value))).map(f => f.field))];
}
