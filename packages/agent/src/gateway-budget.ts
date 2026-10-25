import { z } from "zod";
import { db, json } from "@context/db";
import { hackConfig } from "@context/config";
import { budgetIdentity, rubNanos } from "./hackathon-budget.ts";

const schema = z.object({
  info: z.object({
    max_budget: z.number().positive().finite(),
    spend: z.number().nonnegative().finite(),
    budget_duration: z.literal("1d"),
    budget_reset_at: z.string(),
    blocked: z.boolean().nullable().optional(),
  }),
});
export type GatewayBudget = { limit: number; spend: number; resetAt: string };
async function readGatewayBudget(): Promise<GatewayBudget> {
  const endpoint = new URL(hackConfig.HACKATHON_LLM_BASE_URL);
  const response = await fetch(new URL("/key/info", endpoint), {
    headers: { authorization: `Bearer ${hackConfig.HACKATHON_LLM_API_KEY}` },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error("GATEWAY_BUDGET_UNAVAILABLE");
  const { info } = schema.parse(await response.json());
  const remaining = Date.parse(info.budget_reset_at) - Date.now();
  // The organiser instruction defines this key's 500-unit cap as 500 RUB/day.
  // No token tariff or USD/RUB exchange rate is inferred from these counters.
  if (
    info.blocked ||
    info.max_budget !== 500 ||
    !(remaining > 120000 && remaining <= 86401000)
  )
    throw new Error("GATEWAY_BUDGET_POLICY_MISMATCH");
  if (info.spend >= info.max_budget)
    throw new Error("HACKATHON_DAILY_BUDGET_EXCEEDED");
  const resetHour = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Moscow",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
  }).format(new Date(info.budget_reset_at));
  if (resetHour !== "03:00") throw new Error("GATEWAY_BUDGET_POLICY_MISMATCH");
  return {
    limit: info.max_budget,
    spend: info.spend,
    resetAt: info.budget_reset_at,
  };
}
export async function gatewayBudget(): Promise<GatewayBudget> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await readGatewayBudget();
    } catch (e) {
      if (
        attempt === 2 ||
        (e instanceof Error &&
          [
            "GATEWAY_BUDGET_POLICY_MISMATCH",
            "HACKATHON_DAILY_BUDGET_EXCEEDED",
          ].includes(e.message))
      )
        throw e;
      await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
    }
  }
  throw new Error("GATEWAY_BUDGET_UNAVAILABLE");
}
const budgetEquivalent = (units: number, limit: number) =>
  BigInt(Math.ceil((units / limit) * 500 * 1e9));
export async function reserveGatewayBudget(
  runId: string,
  model: string,
  guard: () => Promise<unknown>,
) {
  const identity = budgetIdentity(),
    cap = rubNanos(String(hackConfig.HACKATHON_BUDGET_RUB));
  for (let n = 0; n < 100; n++) {
    await guard();
    const existing = await db.dailyBudget.findUnique({
      where: { id: identity.id },
    });
    if (existing?.reserved) {
      await new Promise((r) => setTimeout(r, 1000));
      continue;
    }
    const snapshot = await gatewayBudget();
    const reservation = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${identity.id}))`;
      let row = await tx.dailyBudget.upsert({
        where: { id: identity.id },
        create: { ...identity, cap },
        update: { cap },
      });
      if (row.reserved) return null;
      const observed = budgetEquivalent(snapshot.spend, snapshot.limit);
      const spent = row.spent > observed ? row.spent : observed;
      if (spent >= cap) throw new Error("HACKATHON_DAILY_BUDGET_EXCEEDED");
      row = await tx.dailyBudget.update({
        where: { id: row.id },
        data: { spent, reserved: cap - spent },
      });
      return tx.budgetReservation.create({
        data: { budgetId: row.id, runId, model, estimated: row.reserved },
      });
    });
    if (reservation) {
      await db.corporateTrace.create({
        data: {
          runId,
          stage: "budget",
          tool: "gateway_budget_reservation",
          status: "complete",
          durationMs: 0,
          data: json({
            reservationId: reservation.id,
            limit: snapshot.limit,
            spend: snapshot.spend,
            resetAt: snapshot.resetAt,
            tariffKnown: false,
          }),
        },
      });
      return { reservation, snapshot };
    }
  }
  throw new Error("GATEWAY_BUDGET_BUSY");
}
export async function settleGatewayBudget(
  id: string,
  before: GatewayBudget,
  responseCost: string | null,
  usage?: { input: number; output: number },
) {
  const parsedCost =
    responseCost !== null && /^\d+(\.\d+)?(e-?\d+)?$/i.test(responseCost)
      ? Number(responseCost)
      : null;
  const reportedCost =
    parsedCost !== null && Number.isFinite(parsedCost) && parsedCost >= 0
      ? parsedCost
      : null;
  let after: GatewayBudget,
    accountObserved = true;
  try {
    after = await gatewayBudget();
  } catch (e) {
    if (
      reportedCost === null ||
      Date.now() >= Date.parse(before.resetAt) ||
      (e instanceof Error && e.message === "GATEWAY_BUDGET_POLICY_MISMATCH")
    )
      throw e;
    after = { ...before, spend: before.spend + reportedCost };
    accountObserved = false;
  }
  if (Date.parse(after.resetAt) !== Date.parse(before.resetAt))
    throw new Error("GATEWAY_BUDGET_WINDOW_CHANGED");
  await db.$transaction(async (tx) => {
    const reservation = await tx.budgetReservation.findUniqueOrThrow({
      where: { id },
    });
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${reservation.budgetId}))`;
    const current = await tx.budgetReservation.findUniqueOrThrow({
      where: { id },
    });
    if (!["reserved", "unknown"].includes(current.status)) return;
    const row = await tx.dailyBudget.findUniqueOrThrow({
      where: { id: current.budgetId },
    });
    const byHeader =
      row.spent +
      (reportedCost === null
        ? 0n
        : budgetEquivalent(reportedCost, after.limit));
    const byAccount = budgetEquivalent(after.spend, after.limit);
    await tx.dailyBudget.update({
      where: { id: row.id },
      data: {
        reserved: { decrement: current.estimated },
        spent: byHeader > byAccount ? byHeader : byAccount,
      },
    });
    // Currency of per-call gateway units is not independently confirmed: actual RUB remains null.
    await tx.budgetReservation.update({
      where: { id },
      data: {
        status: "gateway_accounted",
        actual: null,
        ...(usage
          ? { inputTokens: usage.input, outputTokens: usage.output }
          : {}),
      },
    });
    await tx.corporateTrace.create({
      data: {
        runId: current.runId,
        stage: "budget",
        tool: "gateway_cost_receipt",
        status: "complete",
        durationMs: 0,
        data: json({
          reservationId: id,
          before,
          after,
          responseCostUnits: reportedCost,
          accountObserved,
          costRub: null,
          basis: "organizer_gateway_counter",
          tariffKnown: false,
        }),
      },
    });
  });
}
