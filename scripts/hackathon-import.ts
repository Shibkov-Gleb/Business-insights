import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { config, hackConfig } from "@context/config";
import { db } from "@context/db";
import {
  importCorporateCsv,
  fileSha,
} from "../packages/db/src/corporate-import.ts";
import { importBankPdf } from "../packages/agent/src/bank-corpus.ts";
if (config.APP_VARIANT !== "alfa")
  throw new Error("HACKATHON_VARIANT_REQUIRED");
type Source = {
  filename: string;
  kind: "companies" | "people" | "payments" | "bank";
  sha256: string;
  driveId: string;
  title?: string;
  publishedAt?: string;
  publicationMonth?: string;
  dateConfirmed?: boolean;
};
const manifest: { sources: Source[] } = JSON.parse(
  await fs.readFile("data/hackathon/sources.manifest.json", "utf8"),
);
try {
  for (const source of manifest.sources) {
    if (process.argv.includes("--csv") && source.kind === "bank") continue;
    const file = path.join(
      hackConfig.HACKATHON_DATA_ROOT,
      "raw",
      source.filename,
    );
    if ((await fileSha(file)) !== source.sha256)
      throw new Error("SOURCE_HASH_MISMATCH");
    const result =
      source.kind === "bank"
        ? await importBankPdf({
            path: file,
            title: source.title,
            sourceUrl: `https://drive.google.com/file/d/${source.driveId}/view`,
            publishedAt: source.publishedAt,
            publicationMonth: source.publicationMonth,
            dateConfirmed: source.dateConfirmed,
          })
        : await importCorporateCsv(file, source.kind);
    console.log(
      JSON.stringify({
        source: source.filename,
        id: result.id,
        status: "imported",
      }),
    );
  }
} finally {
  await db.$disconnect();
}
