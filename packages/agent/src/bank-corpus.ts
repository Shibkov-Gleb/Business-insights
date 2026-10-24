import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { db, json } from "@context/db";
import { hackConfig } from "@context/config";
import { fileSha } from "../../db/src/corporate-import.ts";
import { fileStore } from "./documents.ts";
import type { CorporateEvidence } from "@context/contracts";
const exec = promisify(execFile);
export type OcrBox = { text: string; confidence: number; x: number; y: number; width: number; height: number; line: string };
export function parseTsv(tsv: string) {
  const boxes: OcrBox[] = [];
  for (const row of tsv.split(/\r?\n/).slice(1)) {
    const c = row.split("\t"); if (c.length < 12 || c[0] !== "5" || !c[11].trim()) continue;
    const confidence = Number(c[10]); if (!Number.isFinite(confidence) || confidence < 0) continue;
    boxes.push({ text: c.slice(11).join("\t"), confidence, x: Number(c[6]), y: Number(c[7]), width: Number(c[8]), height: Number(c[9]), line: c.slice(1, 5).join(":") });
  }
  let text = "", last = "";
  for (const b of boxes) { text += (last === b.line ? " " : text ? "\n" : "") + b.text; last = b.line; }
  return { text, quality: boxes.length ? boxes.reduce((s, x) => s + x.confidence, 0) / boxes.length : 0, boxes };
}
export async function importBankPdf(input: { path: string; title?: string; sourceUrl?: string; publishedAt?: string; publicationMonth?: string; dateConfirmed?: boolean }) {
  const stat = await fs.stat(input.path);
  if (!stat.isFile() || stat.size > hackConfig.HACKATHON_FILE_MAX_BYTES) throw new Error("BANK_FILE_TOO_LARGE");
  const sha256 = await fileSha(input.path), bytes = await fs.readFile(input.path);
  if (bytes.subarray(0, 5).toString() !== "%PDF-") throw new Error("BANK_NOT_PDF");
  let material = await db.bankMaterial.findUnique({ where: { sha256 } });
  if (material?.status === "ready" || material?.status === "partial") return material;
  if (!material) {
    const storageKey = randomUUID(); await fileStore.put(storageKey, bytes);
    material = await db.bankMaterial.create({ data: { title: input.title || path.basename(input.path), filename: path.basename(input.path), storageKey, sha256, sourceUrl: input.sourceUrl } });
  }
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "alfa-ocr-"));
  const cache = path.join(hackConfig.HACKATHON_DATA_ROOT, "ocr", sha256); await fs.mkdir(cache, { recursive: true });
  try {
    const info = await exec("pdfinfo", [input.path], { timeout: 20000, maxBuffer: 1024 * 1024 });
    const pages = Number(info.stdout.match(/^Pages:\s+(\d+)/m)?.[1]);
    if (!pages || pages > hackConfig.HACKATHON_BANK_MAX_PAGES) throw new Error("BANK_PAGE_LIMIT");
    await db.bankMaterial.update({ where: { id: material.id }, data: { status: "processing", pages } });
    const saved = await db.bankPage.findMany({ where: { materialId: material.id }, select: { page: true } });
    let next = 1;
    await Promise.all(Array.from({ length: hackConfig.HACKATHON_OCR_CONCURRENCY }, async () => {
      while (next <= pages) {
        const page = next++;
        if (saved.some(x => x.page === page)) continue;
        const base = path.join(temp, String(page));
        let parsed: ReturnType<typeof parseTsv>, method = "text";
        try { parsed = JSON.parse(await fs.readFile(path.join(cache, `${page}.json`), "utf8")); method = parsed.boxes.length ? "tesseract-rus+eng" : "text"; }
        catch {
          const extracted = await exec("pdftotext", ["-f", String(page), "-l", String(page), "-layout", input.path, "-"], { timeout: 30000, maxBuffer: 4 * 1024 * 1024 });
          if (extracted.stdout.trim().length > 80) parsed = { text: extracted.stdout.trim(), quality: 100, boxes: [] };
          else {
            method = "tesseract-rus+eng";
            await exec("pdftoppm", ["-f", String(page), "-l", String(page), "-scale-to", "2600", "-singlefile", "-png", input.path, base], { timeout: 45000, maxBuffer: 1024 * 1024 });
            const ocr = await exec("tesseract", [base + ".png", "stdout", "-l", "rus+eng", "--psm", "3", "tsv"], { timeout: 90000, maxBuffer: 16 * 1024 * 1024 });
            parsed = parseTsv(ocr.stdout);
          }
          await fs.writeFile(path.join(cache, `${page}.json`), JSON.stringify(parsed));
        }
        await db.bankPage.upsert({ where: { materialId_page: { materialId: material.id, page } }, create: { materialId: material.id, page, text: parsed.text, quality: parsed.quality, boxes: json(parsed.boxes), method, numericVerified: method === "text" }, update: {} });
        console.log(JSON.stringify({ materialId: material.id, stage: "bank_ocr", page, pages, quality: Math.round(parsed.quality) }));
      }
    }));
    const all = await db.bankPage.findMany({ where: { materialId: material.id } });
    const complete = all.filter(x => x.text.length > 80).length;
    return await db.bankMaterial.update({ where: { id: material.id }, data: { status: complete === pages ? "ready" : "partial", publishedAt: input.publishedAt && input.dateConfirmed ? new Date(input.publishedAt) : null, dateStatus: input.dateConfirmed ? "document_reviewed" : input.publicationMonth ? "document_month" : "unknown", coverage: json({ complete, total: pages, ocr: all.filter(x => x.method !== "text").length, publicationMonth: input.publicationMonth || null, numericPolicy: "OCR-числа не подтверждены до ручной сверки с оригиналом", dateProvenance: input.dateConfirmed ? "Ручная сверка даты на первой странице; не metadata Drive" : input.publicationMonth ? "Месяц на обложке; день неизвестен" : "Дата требует сверки с документом" }) } });
  } catch (e) { await db.bankMaterial.update({ where: { id: material.id }, data: { status: "failed" } }); throw e; }
  finally { await fs.rm(temp, { recursive: true, force: true }); }
}
export const normalizeQuote = (s: string) => s.normalize("NFKC").replace(/\s+/g, " ").trim();
export async function bankSearch(query: string, now = new Date()): Promise<CorporateEvidence[]> {
  const terms = (query.match(/[\p{L}\p{N}]{3,}/gu) || []).slice(0, 16).join(" OR ");
  if (!terms) return [];
  const pages = await db.$queryRaw<{ id: string; materialId: string; page: number; text: string; quality: number; numericVerified: boolean; title: string; publishedAt: Date | null; dateStatus: string }[]>`
    SELECT p.*,m.title,m."publishedAt",m."dateStatus" FROM "BankPage" p JOIN "BankMaterial" m ON m.id=p."materialId"
    WHERE m.status IN ('ready','partial') AND (to_tsvector('russian',p.text) @@ websearch_to_tsquery('russian',${terms}) OR p.text % ${query})
    ORDER BY ts_rank(to_tsvector('russian',p.text),websearch_to_tsquery('russian',${terms})) DESC,m."publishedAt" DESC NULLS LAST,p.id LIMIT 8`;
  const result: CorporateEvidence[] = [];
  for (const p of pages) {
    // Keep exact source substrings, prefer narrative sentences without uncertain OCR numerals.
    const fragments = p.text.split(/(?<=[.!?])\s+|\n(?=\S)/).map(x => x.trim()).filter(x => x.length >= 40 && x.length < 1800);
    const words = query.toLowerCase().match(/[\p{L}]{4,}/gu) || [];
    const matching = fragments.filter(s => words.some(w => s.toLowerCase().includes(w.slice(0, 5))));
    for (const quote of matching.slice(0, 3)) {
      const numericUncertain = !p.numericVerified && /\d/.test(quote);
      result.push({ id: `bank:${p.id}:${result.length}`, kind: "bank", sourceId: p.materialId, page: p.page, quote, title: p.title, publishedAt: p.publishedAt?.toISOString() || null, confidence: p.quality >= 75 && !numericUncertain && p.dateStatus === "document_reviewed" ? "verified" : "ocr_uncertain", historical: !p.publishedAt || now.getTime() - p.publishedAt.getTime() > 366 * 86400000 });
    }
  }
  return result.slice(0, 12);
}
