import { createHash } from "node:crypto";
import { db } from "@context/db";
import { hackConfig, hackReadiness } from "@context/config";
const scale = 1_000_000_000n;
export function rubNanos(value: string) {
  const [w, f = ""] = value.split(".");
  if (!/^\d+(\.\d{1,9})?$/.test(value))
    throw new Error("HACKATHON_PRICING_UNKNOWN");
  return BigInt(w) * scale + BigInt(f.padEnd(9, "0"));
}
export function rubString(value: bigint) {
  return `${value / scale}.${(value % scale).toString().padStart(9, "0")}`;
}
export function tokenCost(
  input: number,
  output: number,
  price: { inputRubPerMillion: string; outputRubPerMillion: string },
) {
  return (
    (BigInt(input) * rubNanos(price.inputRubPerMillion) +
      BigInt(output) * rubNanos(price.outputRubPerMillion) +
      999999n) /
    1000000n
  );
}
export function budgetIdentity(
  now = new Date(),
  key = hackConfig.HACKATHON_LLM_API_KEY,
) {
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: hackConfig.HACKATHON_BUDGET_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(
    new Date(
      now.getTime() - hackConfig.HACKATHON_BUDGET_RESET_HOUR * 3_600_000,
    ),
  );
  const keyHash = createHash("sha256")
    .update(key || "unconfigured")
    .digest("hex");
  return { id: `${keyHash}:${day}`, keyHash, day };
}
export async function reserveBudget(
  runId: string,
  model: string,
  estimated: bigint,
) {
  if (estimated < 0n) throw new Error("HACKATHON_PRICING_UNKNOWN");
  const identity = budgetIdentity(),
    cap = rubNanos(String(hackConfig.HACKATHON_BUDGET_RUB));
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${identity.id}))`;
    const b = await tx.dailyBudget.upsert({
      where: { id: identity.id },
      create: { ...identity, cap },
      update: { cap },
    });
    if (b.spent + b.reserved + estimated > cap)
      throw new Error("HACKATHON_DAILY_BUDGET_EXCEEDED");
    await tx.dailyBudget.update({
      where: { id: b.id },
      data: { reserved: { increment: estimated } },
    });
    return tx.budgetReservation.create({
      data: { budgetId: b.id, runId, model, estimated },
    });
  });
}
// Unknown outcomes retain their full reservation. Only gateway usage/reconciliation can release it.
export async function settleBudget(
  id: string,
  result:
    | { input: number; output: number; actual: bigint }
    | "not_charged"
    | "unknown",
) {
  await db.$transaction(async (tx) => {
    const r = await tx.budgetReservation.findUniqueOrThrow({ where: { id } });
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${r.budgetId}))`;
    const current = await tx.budgetReservation.findUniqueOrThrow({
      where: { id },
    });
    if (current.status === "settled" || current.status === "released") return;
    if (result === "unknown") {
      await tx.budgetReservation.update({
        where: { id },
        data: { status: "unknown" },
      });
      return;
    }
    const actual = result === "not_charged" ? 0n : result.actual;
    await tx.dailyBudget.update({
      where: { id: r.budgetId },
      data: {
        reserved: { decrement: r.estimated },
        spent: { increment: actual },
      },
    });
    await tx.budgetReservation.update({
      where: { id },
      data: {
        actual,
        status: result === "not_charged" ? "released" : "settled",
        ...(typeof result === "object"
          ? { inputTokens: result.input, outputTokens: result.output }
          : {}),
      },
    });
  });
}
export async function dailyBudget() {
  const identity = budgetIdentity(),
    b = await db.dailyBudget.findUnique({ where: { id: identity.id } });
  const cap = rubNanos(String(hackConfig.HACKATHON_BUDGET_RUB)),
    spent = b?.spent || 0n,
    reserved = b?.reserved || 0n;
  return {
    day: identity.day,
    timezone: hackConfig.HACKATHON_BUDGET_TIMEZONE,
    resetHour: hackConfig.HACKATHON_BUDGET_RESET_HOUR,
    capRub: rubString(cap),
    spentRub: rubString(spent),
    reservedRub: rubString(reserved),
    remainingRub: rubString(
      cap > spent + reserved ? cap - spent - reserved : 0n,
    ),
    pricingKnown:
      hackConfig.HACKATHON_BILLING_MODE === "tariffs" && hackReadiness().ready,
    accountingMode: hackConfig.HACKATHON_BILLING_MODE,
  };
}
