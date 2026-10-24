import { it, expect } from "vitest";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "../../packages/db/src/index.ts";
import { config, hackConfig } from "../../packages/config/src/index.ts";
import { hackStructured } from "../../packages/agent/src/hackathon-llm.ts";
it("контракт шлюза: Gemma/GLM, usage, постоянный 400, временный 503 и неопределённый резерв", async () => {
  const before = { ...hackConfig }, oldMode = config.APP_MODE, oldVariant = config.APP_VARIANT;
  let mode = "success", calls = 0;
  const received: string[] = [];
  const server = createServer((req, res) => {
    let body = ""; req.on("data", chunk => body += chunk);
    req.on("end", () => { calls++; received.push(JSON.parse(body).model); res.setHeader("Content-Type", "application/json"); if (mode === "schema") { res.statusCode = 400; res.end(JSON.stringify({ error: "json_schema unsupported" })); return; } if (mode === "retry" && calls === 1) { res.statusCode = 503; res.end("temporarily unavailable"); return; } res.end(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }], usage: { prompt_tokens: 20, completion_tokens: 5 } })); });
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("no port");
  const user = await db.user.create({ data: { email: randomUUID() + "@provider.test", passwordHash: "fixture" } });
  const org = await db.organization.create({ data: { name: "Provider fixture", stage: "established", description: "Synthetic gateway contract" } });
  const scope = await db.analysisScope.create({ data: { orgId: org.id, name: "Fixture" } });
  const run = await db.insightRun.create({ data: { orgId: org.id, scopeId: scope.id, userId: user.id, status: "testing", windowFrom: new Date(), windowTo: new Date(), snapshot: {} } });
  Object.assign(hackConfig, { HACKATHON_LLM_BASE_URL: `http://127.0.0.1:${address.port}/v1`, HACKATHON_LLM_API_KEY: randomUUID(), HACKATHON_EXTRACT_MODEL: "test-gemma", HACKATHON_REASON_MODEL: "test-glm", HACKATHON_MODEL_REGISTRY: JSON.stringify({ "test-gemma": "gemma-4-26b-a4b", "test-glm": "glm-5.3-flash" }), HACKATHON_MODEL_PRICES: JSON.stringify({ "test-gemma": { inputRubPerMillion: "1", outputRubPerMillion: "2" }, "test-glm": { inputRubPerMillion: "1", outputRubPerMillion: "2" } }) });
  config.APP_MODE = "live"; config.APP_VARIANT = "alfa";
  try {
    expect(await hackStructured("extract", z.object({ ok: z.boolean() }), "fixture", {}, run.id, async () => {})).toEqual({ ok: true });
    expect(received.at(-1)).toBe("test-gemma");
    calls = 0; mode = "retry";
    expect(await hackStructured("reason", z.object({ ok: z.boolean() }), "fixture", {}, run.id, async () => {})).toEqual({ ok: true }); expect(calls).toBe(2); expect(received.at(-1)).toBe("test-glm");
    calls = 0; mode = "schema";
    await expect(hackStructured("reason", z.object({ ok: z.boolean() }), "fixture", {}, run.id, async () => {})).rejects.toThrow("LLM_SCHEMA_UNSUPPORTED"); expect(calls).toBe(1);
    const reservations = await db.budgetReservation.findMany({ where: { runId: run.id } }); expect(reservations.filter(r => r.status === "unknown")).toHaveLength(2); expect(reservations.filter(r => r.status === "settled")).toHaveLength(2);
    expect(reservations.filter(r => r.status === "settled").every(r => r.inputTokens === 20 && r.outputTokens === 5)).toBe(true);
  } finally { Object.assign(hackConfig, before); config.APP_MODE = oldMode; config.APP_VARIANT = oldVariant; await new Promise<void>(resolve => server.close(() => resolve())); }
}, 60000);
