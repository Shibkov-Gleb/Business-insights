import fs from "node:fs/promises";
import { db } from "@context/db";
import { bankSearch, normalizeQuote } from "../packages/agent/src/bank-corpus.ts";
const materials = await db.bankMaterial.findMany({ orderBy: { filename: "asc" }, omit: { storageKey: true, sourceUrl: true } });
const pages = await db.bankPage.findMany();
const refs = await bankSearch("ключевая ставка денежно кредитные условия инфляция");
let valid = 0;
for (const e of refs) { if (pages.some(p => p.materialId === e.sourceId && p.page === e.page && normalizeQuote(p.text).includes(normalizeQuote(e.quote)))) valid++; }
const report = { generatedAt: new Date().toISOString(), materials: materials.map(m => ({ filename: m.filename, sha256: m.sha256, status: m.status, pages: m.pages, publishedAt: m.publishedAt, dateStatus: m.dateStatus, coverage: m.coverage })), totalPages: pages.length, ocrPages: pages.filter(p => p.method !== "text").length, meanOcrConfidence: pages.reduce((s, p) => s + p.quality, 0) / pages.length, numericVerifiedPages: pages.filter(p => p.numericVerified).length, retrievalQuotes: refs.length, validQuotes: valid, missing: ["Commodities performance"], originalTextPublished: false };
await fs.writeFile("docs/hackathon-bank-audit.json", JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ materials: materials.length, pages: pages.length, quotes: refs.length, valid })); await db.$disconnect();
