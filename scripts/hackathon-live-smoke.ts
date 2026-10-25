import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db, json } from "@context/db";
import { config, hackConfig, hackReadiness } from "@context/config";
import { hackStructured } from "../packages/agent/src/hackathon-llm.ts";
import { assertCorporateRun } from "../packages/agent/src/corporate.ts";
if (
  !process.argv.includes("--confirmed-live-smoke") ||
  config.APP_MODE !== "live" ||
  config.APP_VARIANT !== "alfa" ||
  !hackReadiness().ready
)
  throw new Error("LIVE_SMOKE_NOT_AUTHORIZED_OR_CONFIGURED");
const batch = randomUUID(),
  rows: unknown[] = [];
try {
  const user = await db.user.findUniqueOrThrow({
    where: { email: "founder@example.test" },
  });
  const company = await db.corporateCompany.findUniqueOrThrow({
    where: { externalId: "synthetic-metal" },
  });
  for (const task of ["extract", "reason"] as const) {
    const run = await db.insightRun.create({
      data: {
        orgId: company.orgId!,
        scopeId: company.scopeId!,
        resourceId: company.id,
        userId: user.id,
        kind: "corporate",
        status: "testing",
        windowFrom: new Date(Date.now() - 86400000),
        windowTo: new Date(),
        snapshot: json({ smoke: true, requestId: batch }),
      },
    });
    const start = Date.now();
    try {
      const result = await hackStructured(
        task,
        z.object({ ok: z.literal(true) }),
        'Проверка подключения. Верни только JSON {"ok":true}.',
        { task: "Синтетический тест API, без клиентских данных" },
        run.id,
        () => assertCorporateRun(run.id),
      );
      await db.insightRun.update({
        where: { id: run.id },
        data: { status: "succeeded", finishedAt: new Date() },
      });
      const receipts = await db.corporateTrace.findMany({
        where: { runId: run.id, tool: "gateway_cost_receipt" },
        select: { data: true },
      });
      const usage = await db.budgetReservation.findMany({
        where: { runId: run.id },
        select: { inputTokens: true, outputTokens: true, status: true },
      });
      const row = {
        task,
        model:
          task === "extract"
            ? hackConfig.HACKATHON_EXTRACT_MODEL
            : hackConfig.HACKATHON_REASON_MODEL,
        result,
        latencyMs: Date.now() - start,
        usage,
        receipts,
      };
      rows.push(row);
      console.log(JSON.stringify(row));
    } catch (e) {
      const code =
        e instanceof Error && /^[A-Z_]+$/.test(e.message)
          ? e.message
          : "LIVE_SMOKE_FAILED";
      await db.insightRun.update({
        where: { id: run.id },
        data: { status: "failed", error: code, finishedAt: new Date() },
      });
      rows.push({ task, runId: run.id, error: code });
      throw e;
    }
  }
} finally {
  await fs.mkdir(".hackathon/reports", { recursive: true });
  await fs.writeFile(
    `.hackathon/reports/smoke-${batch}.json`,
    JSON.stringify({ batch, at: new Date().toISOString(), rows }, null, 2),
  );
  await db.$disconnect();
}
