import fs from "node:fs/promises";
import path from "node:path";
import yauzl from "yauzl";
import mammoth from "mammoth";
import { XMLParser } from "fast-xml-parser";
import { config } from "@context/config";
export interface FileStore {
  put(key: string, bytes: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}
export class LocalFileStore implements FileStore {
  resolve(key: string) {
    if (!/^[a-f0-9-]{36}$/.test(key)) throw new Error("INVALID_STORAGE_KEY");
    return path.resolve(config.STORAGE_ROOT, key);
  }
  async put(key: string, bytes: Buffer) {
    await fs.mkdir(config.STORAGE_ROOT, { recursive: true });
    await fs.writeFile(this.resolve(key), bytes, { flag: "wx" });
  }
  async get(key: string) {
    return fs.readFile(this.resolve(key));
  }
  async delete(key: string) {
    await fs.rm(this.resolve(key), { force: true });
  }
}
export const fileStore = new LocalFileStore();
export type Unit = {
  text: string;
  locator: {
    page?: number;
    slide?: number;
    paragraph?: number;
    section?: string;
  };
};
export async function zipEntries(buffer: Buffer): Promise<Map<string, Buffer>> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(
      buffer,
      { lazyEntries: true, validateEntrySizes: true },
      (error, zip) => {
        if (error || !zip) return reject(new Error("INVALID_ARCHIVE"));
        const result = new Map<string, Buffer>();
        let entries = 0,
          total = 0;
        let stopped = false;
        const stop = (e: Error) => {
          stopped = true;
          zip.close();
          reject(e);
        };
        zip.on("error", stop);
        zip.on("end", () => resolve(result));
        zip.on("entry", (entry) => {
          if (stopped) return;
          if (
            ++entries > 5000 ||
            entry.uncompressedSize + total > 100 * 1024 * 1024 ||
            entry.fileName.includes("..") ||
            entry.fileName.includes("vbaProject")
          )
            return stop(new Error("UNSAFE_ARCHIVE"));
          if (entry.fileName.endsWith("/")) return zip.readEntry();
          zip.openReadStream(entry, (err, stream) => {
            if (err || !stream) return stop(new Error("INVALID_ARCHIVE"));
            const chunks: Buffer[] = [];
            stream.on("data", (chunk: Buffer) => {
              total += chunk.length;
              if (total > 100 * 1024 * 1024)
                stop(new Error("ARCHIVE_TOO_LARGE"));
              else chunks.push(chunk);
            });
            stream.on("error", stop);
            stream.on("end", () => {
              if (stopped) return;
              result.set(entry.fileName, Buffer.concat(chunks));
              zip.readEntry();
            });
          });
        });
        zip.readEntry();
      },
    );
  });
}
export async function validateFile(
  bytes: Buffer,
  extension: string,
  mime: string,
) {
  const types: Record<string, string[]> = {
    pdf: ["application/pdf"],
    pptx: [
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ],
    docx: [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
    txt: ["text/plain"],
    md: ["text/plain", "text/markdown", "application/octet-stream"],
  };
  if (!types[extension] || !types[extension].includes(mime))
    throw new Error("UNSUPPORTED_FILE");
  if (bytes.length > config.FILE_MAX_BYTES) throw new Error("FILE_TOO_LARGE");
  if (extension === "pdf" && !bytes.subarray(0, 5).equals(Buffer.from("%PDF-")))
    throw new Error("INVALID_SIGNATURE");
  if (["pptx", "docx"].includes(extension)) {
    if (bytes[0] !== 80 || bytes[1] !== 75)
      throw new Error("INVALID_SIGNATURE");
    const entries = await zipEntries(bytes);
    if (
      !entries.has("[Content_Types].xml") ||
      !entries.has(
        extension === "pptx" ? "ppt/presentation.xml" : "word/document.xml",
      )
    )
      throw new Error("INVALID_OOXML");
  } else if (["txt", "md"].includes(extension)) {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (bytes.includes(0)) throw new Error("INVALID_TEXT");
  }
}
const array = (x: any) => (x === undefined ? [] : Array.isArray(x) ? x : [x]);
export async function parseDocument(bytes: Buffer, extension: string) {
  let units: Unit[] = [];
  let totalUnits = 0;
  const missing: number[] = [];
  const xml = new XMLParser({
    ignoreAttributes: false,
    processEntities: false,
  });
  if (extension === "pdf") {
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = getDocument({
      data: new Uint8Array(bytes),
      useSystemFonts: true,
    });
    const pdf = await task.promise;
    totalUnits = pdf.numPages;
    for (let n = 1; n <= Math.min(300, totalUnits); n++) {
      const p = await pdf.getPage(n),
        t = await p.getTextContent();
      const text = t.items.map((x) => ("str" in x ? x.str : "")).join(" ");
      if (text.trim().length < 20) missing.push(n);
      else units.push({ text, locator: { page: n } });
    }
    await task.destroy();
  } else if (extension === "pptx") {
    const files = await zipEntries(bytes);
    const presentation = xml.parse(
      files.get("ppt/presentation.xml")!.toString(),
    );
    const relations = xml.parse(
      files.get("ppt/_rels/presentation.xml.rels")!.toString(),
    );
    const rels = new Map(
      array(relations.Relationships.Relationship).map((x: any) => [
        x["@_Id"],
        x["@_Target"],
      ]),
    );
    const ids = array(
      presentation["p:presentation"]["p:sldIdLst"]?.["p:sldId"],
    );
    totalUnits = ids.length;
    for (const [i, s] of ids.slice(0, 300).entries()) {
      const target = rels.get(s["@_r:id"]);
      if (typeof target !== "string") continue;
      const key = path.posix.normalize(
        target.startsWith("/") ? target.slice(1) : "ppt/" + target,
      );
      const body = files.get(key)?.toString() || "";
      const parsed = xml.parse(body);
      const texts: string[] = [];
      function walk(o: any) {
        if (!o || typeof o !== "object") return;
        for (const [k, v] of Object.entries(o)) {
          if (k === "a:t") texts.push(...array(v).map(String));
          else if (typeof v === "object") array(v).forEach(walk);
        }
      }
      walk(parsed);
      units.push({ text: texts.join(" "), locator: { slide: i + 1 } });
    }
  } else if (extension === "docx") {
    await zipEntries(bytes);
    const text = (await mammoth.extractRawText({ buffer: bytes })).value;
    units = text
      .split(/\n\s*\n/)
      .filter(Boolean)
      .map((text, i) => ({ text, locator: { paragraph: i + 1 } }));
    totalUnits = units.length;
  } else {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    units = text
      .split(/\n\s*\n/)
      .filter(Boolean)
      .map((text, i) => ({ text, locator: { paragraph: i + 1 } }));
    totalUnits = units.length;
  }
  let length = 0;
  const chunks: Unit[] = [];
  let truncated = false;
  for (const u of units) {
    for (let start = 0; start < u.text.length; start += 1800) {
      const text = u.text.slice(start, start + 2000);
      if (length + text.length > 2000000) {
        truncated = true;
        break;
      }
      length += text.length;
      chunks.push({ text, locator: u.locator });
      if (start + 2000 >= u.text.length) break;
    }
    if (truncated) break;
  }
  const status =
    extension === "pdf" && !chunks.length
      ? "needs_ocr"
      : truncated ||
          missing.length ||
          (["pptx", "pdf"].includes(extension) && totalUnits > 300)
        ? "partial"
        : "ready";
  return {
    chunks,
    status,
    coverage: {
      totalUnits,
      extractedUnits: units.length,
      missingPages: missing,
      truncated,
      characters: length,
      imagesUnderstood: false,
    },
  };
}
