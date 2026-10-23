import { it, expect } from "vitest";
import { estimateCost } from "../../packages/agent/src/cost.ts";
it("стоимость неизвестна без тарифа", () =>
  expect(estimateCost(10, 10, "", "")).toBeNull());
it("денежная оценка вычисляется десятичной арифметикой", () =>
  expect(estimateCost(1000000, 500000, "0.1", "0.2")).toEqual({
    amount: "0.200000000",
    currency: "USD",
    estimated: true,
  }));
