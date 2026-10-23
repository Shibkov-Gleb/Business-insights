import { describe, it, expect } from "vitest";
import {
  organizationInput,
  assessmentSchema,
  runInput,
} from "@context/contracts";
import {
  allowedAddress,
  canonicalUrl,
  validateUrl,
} from "../../packages/agent/src/sources.ts";
import {
  parseDocument,
  validateFile,
} from "../../packages/agent/src/documents.ts";
import { demoSources, demoAssessment } from "../../packages/agent/src/demo.ts";
import {
  severity,
  windows,
  checkpointer,
} from "../../packages/agent/src/graphs.ts";
import { afterAll } from "vitest";
afterAll(() => checkpointer.end());
describe("Idea-stage и контракты", () => {
  it("достаточно трёх обязательных полей", () =>
    expect(
      organizationInput.parse({
        name: "Идея",
        stage: "idea",
        description: "Идея сервиса для небольших команд продаж",
      }).stage,
    ).toBe("idea"));
  it("не принимает короткое описание", () =>
    expect(() =>
      organizationInput.parse({ name: "A", stage: "idea", description: "x" }),
    ).toThrow());
  it("требует timezone в периоде", () =>
    expect(() =>
      runInput.parse({ mode: "normal", initialFrom: "2026-10-20T12:00:00" }),
    ).toThrow());
});
describe("Безопасные источники", () => {
  it.each([
    "127.0.0.1",
    "10.0.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
    "224.0.0.1",
  ])("блокирует %s", (ip) => expect(allowedAddress(ip)).toBe(false));
  it("разрешает публичный IP", () =>
    expect(allowedAddress("8.8.8.8")).toBe(true));
  it.each([
    "file:///etc/passwd",
    "http://localhost/",
    "https://user:pass@example.com",
    "http://example.com:8080",
  ])("блокирует URL %s", (url) => expect(() => validateUrl(url)).toThrow());
  it("запрет включает поддомены", () =>
    expect(() =>
      validateUrl("https://news.example.com", ["example.com"]),
    ).toThrow());
  it("удаляет tracking без потери запроса", () =>
    expect(canonicalUrl("https://a.test/story?id=3&utm_source=test#x")).toBe(
      "https://a.test/story?id=3",
    ));
});
describe("Документы", () => {
  it("сохраняет абзацы и overlap", async () => {
    const r = await parseDocument(
      Buffer.from("A".repeat(2200) + "\n\nSecond paragraph"),
      "txt",
    );
    expect(r.chunks).toHaveLength(3);
    expect(r.chunks[1].locator.paragraph).toBe(1);
    expect(r.chunks[2].locator.paragraph).toBe(2);
  });
  it("не принимает неверную сигнатуру", async () => {
    await expect(
      validateFile(Buffer.from("fake"), "pdf", "application/pdf"),
    ).rejects.toThrow();
  });
  it("отклоняет бинарный TXT", async () => {
    await expect(
      validateFile(Buffer.from([0, 1, 2]), "txt", "text/plain"),
    ).rejects.toThrow();
  });
});
describe("Отбор событий: размеченные пары", () => {
  const sources = demoSources("2026-10-23T09:00:00Z");
  const cases = [
    ["saas", 0, "high"],
    ["b2b", 0, "high"],
    ["автоматизация", 0, "high"],
    ["аналитика", 0, "high"],
    ["saas", 1, "high"],
    ["логистика", 2, "high"],
    ["товарный бизнес", 2, "high"],
    ["магазин", 3, "high"],
    ["бренд", 3, "high"],
    ["продажи", 3, "high"],
    ["кофейня", 0, "low"],
    ["saas", 4, "low"],
    ["", 1, "low"],
  ];
  it.each(cases)("%s / %s -> %s", (profile, index, expected) => {
    const a = demoAssessment(
      { ...sources[Number(index)], id: "source-1" },
      { description: profile },
    );
    expect(assessmentSchema.safeParse(a).success).toBe(true);
    expect(severity(a)).toBe(expected);
    expect(a.claims[0].evidenceIds).toEqual(["source-1"]);
  });
  it("не выдаёт critical без подтверждённой зависимости", () => {
    const a = demoAssessment(
      { ...sources[0], id: "s" },
      { description: "saas" },
    );
    expect(severity({ ...a, urgency: 5, confidence: "low" })).not.toBe(
      "critical",
    );
  });
  it("разбивает историю на окна до 30 дней", () => {
    const w = windows(new Date("2026-08-01Z"), new Date("2026-10-23Z"));
    expect(w).toHaveLength(3);
    expect(w[0].to).toBe(w[1].from);
  });
});
