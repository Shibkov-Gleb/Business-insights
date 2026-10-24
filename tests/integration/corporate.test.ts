import { afterAll, expect, it } from "vitest";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { db } from "../../packages/db/src/index.ts";
import { importCorporateCsv } from "../../packages/db/src/corporate-import.ts";
import { companyContext, assertCompanyGrant } from "../../packages/db/src/corporate-context.ts";
import { reserveBudget, settleBudget, budgetIdentity } from "../../packages/agent/src/hackathon-budget.ts";
import { hackConfig } from "../../packages/config/src/hackathon.ts";
import { parseTsv, normalizeQuote } from "../../packages/agent/src/bank-corpus.ts";
const folder = ".cache/corporate-" + randomUUID();
afterAll(async () => { await fs.rm(folder, { recursive: true, force: true }); });
it("COPY: конфликтующие варианты, пропуски, неизвестные контрагенты, Decimal и повторный импорт", async () => {
  await fs.mkdir(folder, { recursive: true });
  await fs.writeFile(folder + "/companies.csv", '\ufeffSYNTHETIC_U;REVENUE_COMPANY;GROUP_ID;MAINOKVED_NAME;CL_PRODUCT_LOA_MARK\nTEST-U-A;9007199254740993.123456;G;Металл;1.0\nTEST-U-B;100;G;Транспорт;0.0\nTEST-U-B;200;H;Транспорт;0.0\n');
  const first = await importCorporateCsv(folder + "/companies.csv", "companies");
  expect(first.reused).toBe(false); expect((await importCorporateCsv(folder + "/companies.csv", "companies")).reused).toBe(true);
  const a = await db.corporateCompany.findUniqueOrThrow({ where: { externalId: "TEST-U-A" } }), b = await db.corporateCompany.findUniqueOrThrow({ where: { externalId: "TEST-U-B" } });
  expect(a.revenue?.toString()).toBe("9007199254740993.123456"); expect(b.revenue).toBeNull(); expect(b.conflicts).toContain("REVENUE_COMPANY"); expect(await db.companyVariant.count({ where: { companyId: b.id } })).toBe(2);
  expect((await companyContext(b.id)).facts.some(x => x.key === "REVENUE_COMPANY")).toBe(false);
  await fs.writeFile(folder + "/payments.csv", 'BENEFICIARY;PAYER;PAY_AMT;PAY_CNT\nUNKNOWN-X;TEST-U-A;9007199254740993.123456;9007199254740993\nTEST-U-B;TEST-U-A;0.000001;2\n');
  await importCorporateCsv(folder + "/payments.csv", "payments");
  expect((await db.paymentEdge.findFirstOrThrow({ where: { payer: "TEST-U-A", beneficiary: "UNKNOWN-X" } })).count.toString()).toBe("9007199254740993");
  expect((await db.corporateCompany.findUniqueOrThrow({ where: { externalId: "UNKNOWN-X" } })).unknown).toBe(true);
  await expect(assertCompanyGrant(randomUUID(), a.id)).rejects.toThrow("COMPANY_ACCESS_DENIED");
  const context = await companyContext(a.id); expect(context.datasetPosition.realMarketShare).toBeNull(); expect(context.unknowns.some(x => x.includes("Единица выручки"))).toBe(true);
});
it("общий дневной бюджет сериализует конкурентные резервы и удерживает неизвестные исходы", async () => {
  const previous = hackConfig.HACKATHON_LLM_API_KEY; hackConfig.HACKATHON_LLM_API_KEY = randomUUID();
  try {
    const results = await Promise.allSettled(Array.from({ length: 12 }, () => reserveBudget(randomUUID(), "test-approved", 60_000_000_000n)));
    expect(results.filter(x => x.status === "fulfilled")).toHaveLength(8);
    const b = await db.dailyBudget.findUniqueOrThrow({ where: { id: budgetIdentity().id } }); expect(b.reserved).toBe(480_000_000_000n);
    const r = results.find(x => x.status === "fulfilled"); if (r?.status !== "fulfilled") throw new Error("missing reservation");
    await settleBudget(r.value.id, "unknown"); expect((await db.dailyBudget.findUniqueOrThrow({ where: { id: b.id } })).reserved).toBe(480_000_000_000n);
    await settleBudget(r.value.id, { input: 10, output: 20, actual: 1_000_000_000n }); await settleBudget(r.value.id, "not_charged");
    const done = await db.dailyBudget.findUniqueOrThrow({ where: { id: b.id } }); expect(done.spent).toBe(1_000_000_000n); expect(done.reserved).toBe(420_000_000_000n);
  } finally { hackConfig.HACKATHON_LLM_API_KEY = previous; }
});
it("OCR сохраняет координаты и качество, точные цитаты нормализуют только пробелы", () => {
  const parsed = parseTsv("level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n5\t1\t1\t1\t1\t1\t10\t20\t30\t40\t42.5\t14,0%\n");
  expect(parsed.boxes[0].confidence).toBe(42.5); expect(parsed.boxes[0].x).toBe(10); expect(parsed.quality).toBe(42.5); expect(normalizeQuote("Ставка\n  без изменения")).toBe("Ставка без изменения");
});
