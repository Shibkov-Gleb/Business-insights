import { it, expect } from "vitest";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "../../packages/db/src/index.ts";
import { config, hackConfig } from "../../packages/config/src/index.ts";
import { hackStructured } from "../../packages/agent/src/hackathon-llm.ts";
it("шлюз без тарифов: полный атомарный резерв, последовательность, hard cap и неизвестный исход", async () => {
  const original = { ...hackConfig },
    oldMode = config.APP_MODE,
    oldVariant = config.APP_VARIANT;
  let spend = 0,
    limit = 500,
    active = 0,
    maxActive = 0,
    calls = 0,
    disconnect = false,
    failBalanceAfterCall = false,
    balanceDown = false,
    outputLimit = false;
  const reset = new Date(
    Math.floor(Date.now() / 86400000) * 86400000 + 86400000,
  ).toISOString();
  const server = createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/key/info") {
      if (balanceDown) {
        res.statusCode = 503;
        res.end("{}");
        return;
      }
      res.end(
        JSON.stringify({
          info: {
            max_budget: limit,
            spend,
            budget_duration: "1d",
            budget_reset_at: reset,
          },
        }),
      );
      return;
    }
    req.resume();
    req.on("end", () => {
      calls++;
      active++;
      maxActive = Math.max(maxActive, active);
      if (disconnect) {
        active--;
        req.socket.destroy();
        return;
      }
      setTimeout(() => {
        spend += 0.25;
        if (failBalanceAfterCall) balanceDown = true;
        active--;
        res.setHeader("x-litellm-response-cost", "0.25");
        res.end(
          JSON.stringify({
            choices: [
              {
                finish_reason: outputLimit ? "length" : "stop",
                message: { content: '{"ok":true}' },
              },
            ],
            usage: { prompt_tokens: 20, completion_tokens: 5 },
          }),
        );
      }, 100);
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("PORT");
  const user = await db.user.create({
    data: { email: randomUUID() + "@budget.test", passwordHash: "fixture" },
  });
  const org = await db.organization.create({
    data: {
      name: "Gateway budget fixture",
      stage: "established",
      description: "Synthetic",
    },
  });
  const scope = await db.analysisScope.create({
    data: { orgId: org.id, name: "Fixture" },
  });
  const run = await db.insightRun.create({
    data: {
      orgId: org.id,
      scopeId: scope.id,
      userId: user.id,
      status: "testing",
      windowFrom: new Date(),
      windowTo: new Date(),
      snapshot: {},
    },
  });
  Object.assign(hackConfig, {
    HACKATHON_BILLING_MODE: "gateway",
    HACKATHON_LLM_BASE_URL: `http://127.0.0.1:${address.port}/v1`,
    HACKATHON_LLM_API_KEY: randomUUID(),
    HACKATHON_EXTRACT_MODEL: "fixture-gemma",
    HACKATHON_REASON_MODEL: "fixture-glm",
    HACKATHON_MODEL_REGISTRY: JSON.stringify({
      "fixture-gemma": "gemma-4-26b-a4b",
      "fixture-glm": "glm-5.3-flash",
    }),
    HACKATHON_MODEL_PRICES: "{}",
  });
  config.APP_MODE = "live";
  config.APP_VARIANT = "alfa";
  const call = () =>
    hackStructured(
      "extract",
      z.object({ ok: z.boolean() }),
      "fixture",
      {},
      run.id,
      async () => {},
    );
  try {
    expect(await Promise.all([call(), call()])).toEqual([
      { ok: true },
      { ok: true },
    ]);
    expect(maxActive).toBe(1);
    expect(calls).toBe(2);
    const reservations = await db.budgetReservation.findMany({
      where: { runId: run.id },
    });
    expect(
      reservations.every(
        (r) => r.status === "gateway_accounted" && r.actual === null,
      ),
    ).toBe(true);
    expect(reservations.some((r) => r.estimated === 500000000000n)).toBe(true);
    limit = 501;
    await expect(call()).rejects.toThrow("GATEWAY_BUDGET_POLICY_MISMATCH");
    expect(calls).toBe(2);
    limit = 500;
    spend = 500;
    await expect(call()).rejects.toThrow("HACKATHON_DAILY_BUDGET_EXCEEDED");
    expect(calls).toBe(2);
    spend = 0.5;
    failBalanceAfterCall = true;
    expect(await call()).toEqual({ ok: true });
    expect(
      (
        await db.corporateTrace.findFirstOrThrow({
          where: { runId: run.id, tool: "gateway_cost_receipt" },
          orderBy: { createdAt: "desc" },
        })
      ).data,
    ).toMatchObject({ accountObserved: false, costRub: null });
    balanceDown = false;
    failBalanceAfterCall = false;
    outputLimit = true;
    await expect(call()).rejects.toThrow("LLM_OUTPUT_LIMIT");
    expect(calls).toBe(4);
    expect(
      await db.budgetReservation.count({
        where: { runId: run.id, status: "unknown" },
      }),
    ).toBe(0);
    outputLimit = false;
    disconnect = true;
    await expect(call()).rejects.toThrow();
    expect(calls).toBe(5);
    const unknown = await db.budgetReservation.findFirstOrThrow({
      where: { runId: run.id, status: "unknown" },
    });
    expect(unknown.actual).toBeNull();
    expect(unknown.estimated).toBeGreaterThan(0n);
    expect(
      (
        await db.dailyBudget.findUniqueOrThrow({
          where: { id: unknown.budgetId },
        })
      ).reserved,
    ).toBe(unknown.estimated);
  } finally {
    Object.assign(hackConfig, original);
    config.APP_MODE = oldMode;
    config.APP_VARIANT = oldVariant;
    await new Promise<void>((r) => server.close(() => r()));
  }
}, 60000);

it("банк: непроверенный скан не вытесняет датированный подтверждённый тезис", async () => {
  const { bankSearch } = await import(
    "../../packages/agent/src/bank-corpus.ts"
  );
  const ids: string[] = [];
  try {
    for (let i = 0; i < 10; i++) {
      const uncertain = i < 9;
      const m = await db.bankMaterial.create({
        data: {
          title: "Synthetic RAG fixture",
          filename: "fixture.pdf",
          sha256: randomUUID(),
          storageKey: "fixture",
          status: "ready",
          publishedAt: uncertain ? null : new Date(),
          dateStatus: uncertain ? "unknown" : "document_reviewed",
        },
      });
      ids.push(m.id);
      await db.bankPage.create({
        data: {
          materialId: m.id,
          page: 1,
          text: uncertain
            ? "Ставка ставка ставка ставка ставка меняется, но это непроверенный скан без даты публикации."
            : "Денежная политика влияет на стоимость заимствований и условия кредитования предприятий.",
          method: uncertain ? "ocr" : "text",
          quality: uncertain ? 50 : 100,
          numericVerified: !uncertain,
        },
      });
    }
    const found = await bankSearch("ставка денежная политика кредитование");
    expect(found[0]).toMatchObject({
      sourceId: ids[9],
      confidence: "verified",
      historical: false,
    });
  } finally {
    await db.bankPage.deleteMany({ where: { materialId: { in: ids } } });
    await db.bankMaterial.deleteMany({ where: { id: { in: ids } } });
  }
});
