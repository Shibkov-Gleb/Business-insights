// Optional cache warm-up; the application importer uses the same local Tesseract pipeline.
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
const exec = promisify(execFile);
const manifest = JSON.parse(await fs.readFile("data/hackathon/sources.manifest.json", "utf8"));
const jobs = [];
for (const s of manifest.sources.filter(x => x.kind === "bank")) {
  const file = path.resolve(".hackathon/raw", s.filename);
  const info = await exec("pdfinfo", [file]);
  const count = Number(info.stdout.match(/^Pages:\s+(\d+)/m)[1]);
  await fs.mkdir(`.hackathon/ocr/${s.sha256}`, { recursive: true });
  for (let page = 1; page <= count; page++) jobs.push({ s, file, page });
}
let next = 0;
await Promise.all([0, 1].map(async () => {
  while (next < jobs.length) {
    const { s, file, page } = jobs[next++], cache = `.hackathon/ocr/${s.sha256}/${page}.json`;
    try { await fs.access(cache); continue; } catch { /* Uncached page: perform local OCR. */ }
    const base = `/tmp/alfa-${s.sha256}-${page}`;
    await exec("pdftoppm", ["-f", String(page), "-l", String(page), "-scale-to", "2600", "-singlefile", "-png", file, base], { timeout: 60000 });
    const ocr = await exec("tesseract", [base + ".png", "stdout", "-l", "rus+eng", "--psm", "3", "tsv"], { timeout: 90000, maxBuffer: 16 * 1024 * 1024 });
    const boxes = [];
    for (const row of ocr.stdout.split(/\r?\n/).slice(1)) { const c = row.split("\t"); if (c.length < 12 || c[0] !== "5" || !c[11].trim() || Number(c[10]) < 0) continue; boxes.push({ text: c.slice(11).join("\t"), confidence: Number(c[10]), x: Number(c[6]), y: Number(c[7]), width: Number(c[8]), height: Number(c[9]), line: c.slice(1, 5).join(":") }); }
    let text = "", last = ""; for (const b of boxes) { text += (last === b.line ? " " : text ? "\n" : "") + b.text; last = b.line; }
    await fs.writeFile(cache, JSON.stringify({ text, quality: boxes.length ? boxes.reduce((sum, x) => sum + x.confidence, 0) / boxes.length : 0, boxes }));
    await fs.rm(base + ".png");
    console.log(JSON.stringify({ file: s.filename, page, complete: next, total: jobs.length }));
  }
}));
