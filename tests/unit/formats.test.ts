import { describe, it, expect } from "vitest";
import {
  parseDocument,
  zipEntries,
} from "../../packages/agent/src/documents.ts";
import { fixtures, zip } from "../../scripts/fixtures.ts";
describe("Пять форматов и безопасные архивы", () => {
  it.each(["txt", "md", "pdf", "docx", "pptx"])(
    "%s сохраняет текст и locators",
    async (extension) => {
      const r = await parseDocument(
        fixtures[("synthetic." + extension) as keyof typeof fixtures],
        extension,
      );
      expect(r.status).toBe("ready");
      expect(r.chunks.length).toBeGreaterThan(0);
      expect(Object.keys(r.chunks[0].locator)).toHaveLength(1);
    },
  );
  it("слайды следуют relationships, а не имени файла", async () => {
    const r = await parseDocument(fixtures["synthetic.pptx"], "pptx");
    expect(r.chunks[0].text).toContain("first slide");
    expect(r.chunks[1].locator.slide).toBe(2);
  });
  it("PDF без текста требует OCR", async () =>
    expect((await parseDocument(fixtures["scanned.pdf"], "pdf")).status).toBe(
      "needs_ocr",
    ));
  it("отклоняет слишком много ZIP entries", async () => {
    await expect(
      zipEntries(
        zip(
          Object.fromEntries(
            Array.from({ length: 5001 }, (_, i) => ["f" + i, "x"]),
          ),
        ),
      ),
    ).rejects.toThrow();
  });
  it("отклоняет path traversal", async () => {
    await expect(zipEntries(zip({ "../escape": "x" }))).rejects.toThrow();
  });
});
