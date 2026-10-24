import { createReadStream } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { basename } from "node:path";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import { parse } from "csv-parse";
import pg from "pg";
import { from as copyFrom } from "pg-copy-streams";
import { config } from "@context/config";
export type ImportSettings = { revenueUnit: "unknown" | "RUB" | "thousand_RUB"; paymentUnit: "unknown" | "RUB"; paymentPeriod: string | null };
export const defaultImportSettings: ImportSettings = { revenueUnit: "unknown", paymentUnit: "unknown", paymentPeriod: null };
export async function fileSha(path: string) { const hash = createHash("sha256"); for await (const chunk of createReadStream(path)) hash.update(chunk); return hash.digest("hex"); }
export async function importCorporateCsv(path: string, kind: "companies" | "people" | "payments", settings = defaultImportSettings) {
  const sha256 = await fileSha(path), client = new pg.Client({ connectionString: config.DATABASE_URL });
  await client.connect();
  const id = randomUUID();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["case-import"]);
    const prior = await client.query('SELECT * FROM "DatasetImport" WHERE sha256=$1', [sha256]);
    if (prior.rows.length) { await client.query("ROLLBACK"); return { ...prior.rows[0], reused: true }; }
    // Only one active source version per kind. A different file requires explicit replacement in a new database.
    const active = await client.query('SELECT id FROM "DatasetImport" WHERE kind=$1 AND status=\'ready\'', [kind]);
    if (active.rows.length) throw new Error("DATASET_VERSION_REQUIRES_MIGRATION");
    await client.query('INSERT INTO "DatasetImport"(id,kind,filename,sha256,settings) VALUES($1,$2,$3,$4,$5)', [id, kind, basename(path), sha256, settings]);
    await client.query("CREATE TEMP TABLE case_stage (row_no integer GENERATED ALWAYS AS IDENTITY (START WITH 2), data jsonb NOT NULL) ON COMMIT DROP");
    let rows = 0;
    const required = kind === "companies" ? ["SYNTHETIC_U", "REVENUE_COMPANY", "GROUP_ID"] : kind === "people" ? ["SYNTHETIC_F", "SYNTHETIC_U"] : ["BENEFICIARY", "PAYER", "PAY_AMT", "PAY_CNT"];
    const parser = parse({ bom: true, delimiter: ";", columns: (headers: string[]) => { if (!required.every(x => headers.includes(x)) || new Set(headers).size !== headers.length) throw new Error("CSV_HEADER_INVALID"); return headers; }, skip_empty_lines: true, max_record_size: 1024 * 1024 });
    const encode = new Transform({ writableObjectMode: true, transform(record: Record<string, string>, _encoding, cb) { rows++; cb(null, '"' + JSON.stringify(record).replaceAll('"', '""') + '"\n'); } });
    await pipeline(createReadStream(path), parser, encode, client.query(copyFrom("COPY case_stage(data) FROM STDIN WITH (FORMAT CSV)")));
    let report: Record<string, unknown> = { logicalRows: rows, rowLocator: "Номер записи CSV с заголовком в строке 1; многострочное поле — одна запись", units: settings };
    if (kind === "companies") {
      await client.query("CREATE INDEX ON case_stage ((data->>'SYNTHETIC_U'))");
      const bad = await client.query("SELECT count(*)::int n FROM case_stage WHERE coalesce(data->>'SYNTHETIC_U','')='' OR (coalesce(data->>'REVENUE_COMPANY','')<>'' AND NOT (data->>'REVENUE_COMPANY' ~ '^[0-9]+([.][0-9]{1,6})?$'))");
      if (bad.rows[0].n) throw new Error("CSV_COMPANY_VALUE_INVALID");
      await client.query(`CREATE TEMP TABLE case_grouped ON COMMIT DROP AS
        WITH g AS (SELECT data->>'SYNTHETIC_U' external_id,min(row_no) source_row,(array_agg(data ORDER BY row_no))[1] fields,count(*) n FROM case_stage GROUP BY 1)
        SELECT external_id,source_row,fields,CASE WHEN n>1 THEN ARRAY(SELECT key FROM case_stage t CROSS JOIN LATERAL jsonb_each_text(t.data) e WHERE t.data->>'SYNTHETIC_U'=g.external_id GROUP BY key HAVING count(DISTINCT value)>1) ELSE ARRAY[]::text[] END conflicts FROM g`);
      await client.query(`INSERT INTO "CorporateCompany"(id,"externalId",name,"datasetId","groupId",fields,conflicts,revenue,"sourceRow")
        SELECT gen_random_uuid(),external_id,'Компания '||left(external_id,12),$1,
        CASE WHEN 'GROUP_ID'=ANY(conflicts) THEN NULL ELSE nullif(fields->>'GROUP_ID','') END,
        fields - conflicts, conflicts,CASE WHEN 'REVENUE_COMPANY'=ANY(conflicts) THEN NULL ELSE nullif(fields->>'REVENUE_COMPANY','')::numeric END,source_row FROM case_grouped
        ON CONFLICT ("externalId") DO UPDATE SET "datasetId"=excluded."datasetId", "groupId"=excluded."groupId",fields=excluded.fields,conflicts=excluded.conflicts,revenue=excluded.revenue,"sourceRow"=excluded."sourceRow",unknown=false,version="CorporateCompany".version+1`, [id]);
      await client.query(`INSERT INTO "CompanyVariant"(id,"companyId","datasetId","sourceRow",fields) SELECT gen_random_uuid(),c.id,$1,s.row_no,s.data FROM case_stage s JOIN "CorporateCompany" c ON c."externalId"=s.data->>'SYNTHETIC_U'`, [id]);
      const stats = await client.query('SELECT count(*)::int "uniqueIds", count(*) FILTER(WHERE cardinality(conflicts)>0)::int "conflictingIds" FROM case_grouped');
      const conflicts = await client.query('SELECT external_id, conflicts FROM case_grouped WHERE cardinality(conflicts)>0');
      const missing = await client.query("SELECT key,count(*)::int n FROM case_stage CROSS JOIN LATERAL jsonb_each_text(data) e WHERE value='' GROUP BY key ORDER BY key");
      report = { ...report, ...stats.rows[0], duplicates: rows - stats.rows[0].uniqueIds, conflicts: conflicts.rows, missing: missing.rows, marketShare: "unknown", negativeMarkMeaning: "Признак из источника; не оценка кредитного риска и не доказательство владения" };
    } else if (kind === "people") {
      await client.query(`INSERT INTO "PersonCompanyLink"("datasetId","personId","companyExternalId","sourceRow",fields) SELECT $1,data->>'SYNTHETIC_F',data->>'SYNTHETIC_U',row_no,data FROM case_stage`, [id]);
      report.note = "Связанное обезличенное лицо не доказывает владение или контроль; связи не предоставляют доступ";
    } else {
      const bad = await client.query("SELECT count(*)::int n FROM case_stage WHERE coalesce(data->>'PAYER','')='' OR coalesce(data->>'BENEFICIARY','')='' OR NOT(coalesce(data->>'PAY_AMT','') ~ '^[0-9]+([.][0-9]{1,6})?$') OR NOT(coalesce(data->>'PAY_CNT','') ~ '^[0-9]+([.]0+)?$')");
      if (bad.rows[0].n) throw new Error("CSV_PAYMENT_VALUE_INVALID");
      await client.query(`INSERT INTO "PaymentEdge"("datasetId","sourceRow",payer,beneficiary,amount,count) SELECT $1,row_no,data->>'PAYER',data->>'BENEFICIARY',(data->>'PAY_AMT')::numeric,(data->>'PAY_CNT')::numeric::bigint FROM case_stage`, [id]);
      await client.query(`INSERT INTO "CorporateCompany"(id,"externalId",name,unknown,fields,conflicts) SELECT gen_random_uuid(),uid,'Неизвестный контрагент '||left(uid,10),true,'{}','{}' FROM (SELECT data->>'PAYER' uid FROM case_stage UNION SELECT data->>'BENEFICIARY' FROM case_stage) p ON CONFLICT ("externalId") DO NOTHING`);
      const stats = await client.query(`SELECT sum(amount)::text "amountSum",sum(count)::text "paymentCount",count(*) FILTER(WHERE payer=beneficiary)::int "selfLinks" FROM "PaymentEdge" WHERE "datasetId"=$1`, [id]);
      const unknown = await client.query('SELECT count(*)::int n FROM "CorporateCompany" WHERE unknown');
      report = { ...report, ...stats.rows[0], unknownCounterparties: unknown.rows[0].n, warning: "Валюта, период, ставка кредита и направление ВЭД отсутствуют; концентрация относится только к предоставленным связям" };
    }
    await client.query('UPDATE "DatasetImport" SET status=\'ready\',rows=$2,report=$3 WHERE id=$1', [id, rows, report]);
    await client.query("COMMIT");
    return { id, kind, sha256, rows, report, reused: false };
  } catch (e) { await client.query("ROLLBACK"); throw e; } finally { await client.end(); }
}
