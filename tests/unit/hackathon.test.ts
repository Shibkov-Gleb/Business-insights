import { afterEach, expect, it, vi } from "vitest";
import {
  allowedFamilies,
  hackConfig,
  hackModel,
} from "../../packages/config/src/hackathon.ts";
import {
  rubNanos,
  tokenCost,
  budgetIdentity,
} from "../../packages/agent/src/hackathon-budget.ts";
import { providerError } from "../../packages/agent/src/hackathon-llm.ts";
const original = { ...hackConfig };
afterEach(() => {
  Object.assign(hackConfig, original);
  vi.restoreAllMocks();
});
it("разрешены только шесть семейств из кейса", () =>
  expect(allowedFamilies).toHaveLength(6));
it("личный Gemini никогда не становится fallback", () => {
  process.env.LLM_API_KEY = "personal-secret";
  hackConfig.HACKATHON_EXTRACT_MODEL = "gemini-3.1-flash-lite";
  const http = vi.spyOn(globalThis, "fetch");
  expect(() => hackModel("extract")).toThrow("HACKATHON_MODEL_FORBIDDEN");
  expect(http).not.toHaveBeenCalled();
});
it("неизвестная цена блокирует одобренную модель", () => {
  Object.assign(hackConfig, {
    HACKATHON_EXTRACT_MODEL: "organizer-gemma",
    HACKATHON_MODEL_REGISTRY: JSON.stringify({
      "organizer-gemma": "gemma-4-26b-a4b",
    }),
    HACKATHON_LLM_BASE_URL: "https://gateway.example/v1",
    HACKATHON_LLM_API_KEY: "test",
  });
  expect(() => hackModel("extract")).toThrow("HACKATHON_PRICING_UNKNOWN");
});
it("точная десятичная стоимость и округление резерва вверх", () => {
  expect(rubNanos("0.000000001")).toBe(1n);
  expect(
    tokenCost(1, 0, {
      inputRubPerMillion: "0.000000001",
      outputRubPerMillion: "1",
    }),
  ).toBe(1n);
  expect(
    tokenCost(1000000, 500000, {
      inputRubPerMillion: "10.25",
      outputRubPerMillion: "20.50",
    }),
  ).toBe(20500000000n);
});
it("общие сутки ключа сбрасываются ровно в 03:00 МСК", () => {
  hackConfig.HACKATHON_BUDGET_TIMEZONE = "Europe/Moscow";
  hackConfig.HACKATHON_BUDGET_RESET_HOUR = 3;
  expect(budgetIdentity(new Date("2026-10-24T21:05:00Z"), "same").day).toBe(
    "2026-10-24",
  );
  const before = budgetIdentity(new Date("2026-10-24T23:59:59.999Z"), "same");
  const after = budgetIdentity(new Date("2026-10-25T00:00:00Z"), "same");
  expect(before.day).toBe("2026-10-24");
  expect(after.day).toBe("2026-10-25");
  expect(before.id).not.toBe(after.id);
  expect(before.keyHash).toBe(after.keyHash);
  expect(budgetIdentity(new Date("2026-10-25T20:59:59Z"), "same").id).toBe(
    after.id,
  );
});
it("час сброса настраивается без изменения отпечатка ключа", () => {
  hackConfig.HACKATHON_BUDGET_TIMEZONE = "Europe/Moscow";
  hackConfig.HACKATHON_BUDGET_RESET_HOUR = 0;
  expect(budgetIdentity(new Date("2026-10-24T21:00:00Z"), "same").day).toBe(
    "2026-10-25",
  );
});
it("Budget has been exceeded — постоянная ошибка без повторных платных вызовов", () => {
  for (const status of [400, 402, 403, 429]) {
    const error = providerError(status, "Budget has been exceeded");
    expect(error.code).toBe("LLM_QUOTA");
    expect(error.transient).toBe(false);
  }
});
it("только временные ошибки повторяются", () => {
  expect(providerError(401, "").transient).toBe(false);
  expect(providerError(429, "daily quota").transient).toBe(false);
  expect(providerError(429, "rate limited").transient).toBe(true);
  expect(providerError(503, "").transient).toBe(true);
  expect(providerError(400, "bad input").code).toBe("LLM_REQUEST_REJECTED");
  expect(providerError(400, "json_schema unsupported").code).toBe(
    "LLM_SCHEMA_UNSUPPORTED",
  );
});
