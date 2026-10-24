ALTER TABLE "CorporateInsight" ADD COLUMN "analysisKey" TEXT NOT NULL DEFAULT 'legacy', ADD COLUMN "latestRevisionId" UUID;
CREATE TABLE "CorporateInsightRevision" (
 id UUID PRIMARY KEY, "companyId" UUID NOT NULL, "insightId" UUID NOT NULL REFERENCES "CorporateInsight"(id) ON DELETE CASCADE,
 "runId" UUID NOT NULL REFERENCES "InsightRun"(id) ON DELETE CASCADE, fingerprint TEXT NOT NULL, "analysisKey" TEXT NOT NULL,
 "contextVersion" INTEGER NOT NULL, data JSONB NOT NULL, evidence JSONB NOT NULL, score INTEGER NOT NULL, channels TEXT[] NOT NULL,
 synthetic BOOLEAN NOT NULL, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE("insightId",fingerprint)
);
CREATE INDEX "CorporateInsightRevision_companyId_createdAt_idx" ON "CorporateInsightRevision"("companyId","createdAt");
CREATE INDEX "CorporateInsightRevision_insightId_createdAt_id_idx" ON "CorporateInsightRevision"("insightId","createdAt",id);
INSERT INTO "CorporateInsightRevision"(id,"companyId","insightId","runId",fingerprint,"analysisKey","contextVersion",data,evidence,score,channels,synthetic,"createdAt")
 SELECT gen_random_uuid(),"companyId",id,"runId",'legacy','legacy',"contextVersion",data,evidence,score,channels,synthetic,"createdAt" FROM "CorporateInsight";
UPDATE "CorporateInsight" i SET "latestRevisionId"=r.id FROM "CorporateInsightRevision" r WHERE r."insightId"=i.id;
