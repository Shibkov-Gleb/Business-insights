import "dotenv/config";
import { createHash } from "node:crypto";
import { db, Prisma } from "@context/db";
import { config } from "@context/config";
import { fileStore } from "../packages/agent/src/documents.ts";
if (config.APP_VARIANT !== "alfa")
  throw new Error("HACKATHON_VARIANT_REQUIRED");
// Read-only persistence probe: aggregates and hashes, never client records.
try {
  const tables = [
    "DatasetImport",
    "CorporateCompany",
    "CompanyVariant",
    "PersonCompanyLink",
    "PaymentEdge",
    "CompanyGrant",
    "BankMaterial",
    "BankPage",
    "CorporateNews",
    "CorporateInsight",
    "CorporateInsightRevision",
    "CorporateChat",
    "CorporateFeedback",
  ];
  const counts: Record<string, string> = {};
  for (const table of tables) {
    const rows = await db.$queryRaw<{ count: bigint }[]>(
      Prisma.sql`SELECT count(*) count FROM ${Prisma.raw('"' + table + '"')}`,
    );
    counts[table] = rows[0].count.toString();
  }
  const payments = await db.$queryRaw<
    { amount: string; count: string }[]
  >`SELECT sum(amount)::text amount, sum(count)::text count FROM "PaymentEdge" WHERE "datasetId" IS NOT NULL`;
  const materials = await db.bankMaterial.findMany({
    orderBy: { sha256: "asc" },
    select: { sha256: true, storageKey: true },
  });
  const files = [];
  for (const m of materials) {
    const sha = createHash("sha256")
      .update(await fileStore.get(m.storageKey))
      .digest("hex");
    if (sha !== m.sha256) throw new Error("BANK_FILE_HASH_MISMATCH");
    files.push(sha);
  }
  const records = await Promise.all([
    db.corporateInsightRevision.findMany({ orderBy: { id: "asc" } }),
    db.corporateChat.findMany({ orderBy: { id: "asc" } }),
    db.corporateFeedback.findMany({ orderBy: { id: "asc" } }),
    db.companyGrant.findMany({ orderBy: { id: "asc" } }),
    db.corporateCompany.findMany({
      where: { scopeId: { not: null } },
      orderBy: { id: "asc" },
      select: { id: true, fields: true, conflicts: true, version: true },
    }),
  ]);
  const recordHash = createHash("sha256")
    .update(JSON.stringify(records))
    .digest("hex");
  const state = {
    counts,
    payments: payments[0],
    bankOriginals: files.length,
    bankFilesHash: createHash("sha256").update(files.join("\n")).digest("hex"),
    recordHash,
  };
  console.log(
    JSON.stringify({
      ...state,
      stateHash: createHash("sha256")
        .update(JSON.stringify(state))
        .digest("hex"),
    }),
  );
} finally {
  await db.$disconnect();
}
