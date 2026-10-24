-- AlterTable
ALTER TABLE "Decision" ADD COLUMN     "briefId" UUID,
ALTER COLUMN "threadId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "SourceSnapshot" (
    "id" UUID NOT NULL,
    "canonicalUrl" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "publishedAt" TIMESTAMPTZ,
    "observedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL,

    CONSTRAINT "SourceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RunSource" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "scopeId" UUID NOT NULL,
    "runId" UUID NOT NULL,
    "sourceSnapshotId" UUID NOT NULL,

    CONSTRAINT "RunSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitorWatchSource" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "scopeId" UUID NOT NULL,
    "competitorId" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "CompetitorWatchSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitorSnapshot" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "scopeId" UUID NOT NULL,
    "competitorId" UUID NOT NULL,
    "runId" UUID NOT NULL,
    "facts" JSONB NOT NULL,
    "gaps" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompetitorSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitorChange" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "scopeId" UUID NOT NULL,
    "competitorId" UUID NOT NULL,
    "runId" UUID NOT NULL,
    "field" TEXT NOT NULL,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "beforeSnapshotId" UUID NOT NULL,
    "afterSnapshotId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompetitorChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchBrief" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "scopeId" UUID NOT NULL,
    "runId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "evidence" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchBrief_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SourceSnapshot_canonicalUrl_checksum_idx" ON "SourceSnapshot"("canonicalUrl", "checksum");

-- CreateIndex
CREATE INDEX "RunSource_orgId_scopeId_sourceSnapshotId_idx" ON "RunSource"("orgId", "scopeId", "sourceSnapshotId");

-- CreateIndex
CREATE UNIQUE INDEX "RunSource_runId_sourceSnapshotId_key" ON "RunSource"("runId", "sourceSnapshotId");

-- CreateIndex
CREATE UNIQUE INDEX "CompetitorWatchSource_competitorId_url_key" ON "CompetitorWatchSource"("competitorId", "url");

-- CreateIndex
CREATE INDEX "CompetitorSnapshot_orgId_scopeId_competitorId_createdAt_idx" ON "CompetitorSnapshot"("orgId", "scopeId", "competitorId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CompetitorSnapshot_runId_competitorId_key" ON "CompetitorSnapshot"("runId", "competitorId");

-- CreateIndex
CREATE INDEX "CompetitorChange_orgId_scopeId_createdAt_idx" ON "CompetitorChange"("orgId", "scopeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CompetitorChange_runId_competitorId_field_key" ON "CompetitorChange"("runId", "competitorId", "field");

-- CreateIndex
CREATE UNIQUE INDEX "ResearchBrief_runId_key" ON "ResearchBrief"("runId");

-- CreateIndex
CREATE INDEX "ResearchBrief_orgId_scopeId_createdAt_idx" ON "ResearchBrief"("orgId", "scopeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Decision_briefId_key" ON "Decision"("briefId");

ALTER TABLE "RunSource" ADD FOREIGN KEY ("runId") REFERENCES "InsightRun"(id) ON DELETE CASCADE;
ALTER TABLE "RunSource" ADD FOREIGN KEY ("sourceSnapshotId") REFERENCES "SourceSnapshot"(id);
ALTER TABLE "CompetitorWatchSource" ADD FOREIGN KEY ("competitorId") REFERENCES "Competitor"(id) ON DELETE CASCADE;
ALTER TABLE "CompetitorSnapshot" ADD FOREIGN KEY ("competitorId") REFERENCES "Competitor"(id) ON DELETE CASCADE;
ALTER TABLE "CompetitorSnapshot" ADD FOREIGN KEY ("runId") REFERENCES "InsightRun"(id) ON DELETE CASCADE;
ALTER TABLE "CompetitorChange" ADD FOREIGN KEY ("competitorId") REFERENCES "Competitor"(id) ON DELETE CASCADE;
ALTER TABLE "CompetitorChange" ADD FOREIGN KEY ("beforeSnapshotId") REFERENCES "CompetitorSnapshot"(id) ON DELETE CASCADE;
ALTER TABLE "CompetitorChange" ADD FOREIGN KEY ("afterSnapshotId") REFERENCES "CompetitorSnapshot"(id) ON DELETE CASCADE;
ALTER TABLE "ResearchBrief" ADD FOREIGN KEY ("runId") REFERENCES "InsightRun"(id) ON DELETE CASCADE;
ALTER TABLE "Decision" ADD FOREIGN KEY ("briefId") REFERENCES "ResearchBrief"(id) ON DELETE SET NULL;
