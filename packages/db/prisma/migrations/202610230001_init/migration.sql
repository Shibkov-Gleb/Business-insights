-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Moscow',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" UUID,
    "csrf" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthToken" (
    "id" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "AuthToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "allScopes" BOOLEAN NOT NULL DEFAULT true,
    "scopeIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "workRole" TEXT NOT NULL DEFAULT 'founder',
    "interests" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "orgId" UUID NOT NULL,
    "email" TEXT,
    "role" TEXT NOT NULL,
    "allScopes" BOOLEAN NOT NULL,
    "scopeIds" TEXT[],
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "acceptedAt" TIMESTAMPTZ,
    "revoked" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalysisScope" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "cursorAt" TIMESTAMPTZ,
    "cursorVersion" INTEGER NOT NULL DEFAULT 0,
    "settings" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "AnalysisScope_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfileVersion" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "scopeId" UUID,
    "version" INTEGER NOT NULL,
    "fields" JSONB NOT NULL,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfileVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfileProposal" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "scopeId" UUID,
    "documentId" UUID,
    "expectedVersion" INTEGER NOT NULL,
    "fields" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfileProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "scopeId" UUID,
    "name" TEXT NOT NULL,
    "extension" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'uploaded',
    "coverage" JSONB NOT NULL DEFAULT '{}',
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentChunk" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "scopeId" UUID,
    "documentId" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "locator" JSONB NOT NULL,

    CONSTRAINT "DocumentChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Competitor" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "scopeId" UUID NOT NULL,
    "identity" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "decision" TEXT NOT NULL,
    "monitoring" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "userEdited" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Competitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceDocument" (
    "id" UUID NOT NULL,
    "canonicalUrl" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "publisher" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "publishedAt" TIMESTAMPTZ,
    "updatedAt" TIMESTAMPTZ,
    "fetchedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checksum" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "provenance" JSONB NOT NULL,

    CONSTRAINT "SourceDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsightRun" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "scopeId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'analysis',
    "resourceId" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'normal',
    "status" TEXT NOT NULL DEFAULT 'queued',
    "windowFrom" TIMESTAMPTZ NOT NULL,
    "windowTo" TIMESTAMPTZ NOT NULL,
    "cursorVersion" INTEGER NOT NULL DEFAULT 0,
    "snapshot" JSONB NOT NULL,
    "coverage" JSONB NOT NULL DEFAULT '{}',
    "budget" JSONB NOT NULL DEFAULT '{}',
    "error" TEXT,
    "acceptedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMPTZ,

    CONSTRAINT "InsightRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Idempotency" (
    "id" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "resourceId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Idempotency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Outbox" (
    "id" UUID NOT NULL,
    "deliveredAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RunEvent" (
    "id" BIGSERIAL NOT NULL,
    "runId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RunEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Insight" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "scopeId" UUID NOT NULL,
    "eventKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "potentialSeverity" TEXT,
    "confidence" TEXT NOT NULL,
    "lifecycle" TEXT NOT NULL DEFAULT 'active',
    "workStatus" TEXT NOT NULL DEFAULT 'open',
    "latestRevisionId" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Insight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsightRevision" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "scopeId" UUID NOT NULL,
    "insightId" UUID NOT NULL,
    "runId" UUID NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "profileVersionId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "evidence" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InsightRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReadState" (
    "userId" UUID NOT NULL,
    "insightId" UUID NOT NULL,
    "at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReadState_pkey" PRIMARY KEY ("userId","insightId")
);

-- CreateTable
CREATE TABLE "ChatThread" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "scopeId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "insightId" UUID,
    "title" TEXT NOT NULL,
    "visibility" TEXT NOT NULL DEFAULT 'private',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" UUID NOT NULL,
    "threadId" UUID NOT NULL,
    "userId" UUID,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "citations" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'complete',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Decision" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "scopeId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "threadId" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "assertion" TEXT NOT NULL DEFAULT 'hypothesis',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Decision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditRecord" (
    "id" UUID NOT NULL,
    "orgId" UUID,
    "userId" UUID,
    "action" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageRecord" (
    "id" UUID NOT NULL,
    "runId" UUID NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Feedback" (
    "id" UUID NOT NULL,
    "insightId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "useful" BOOLEAN NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_orgId_userId_key" ON "Membership"("orgId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");

-- CreateIndex
CREATE INDEX "AnalysisScope_orgId_idx" ON "AnalysisScope"("orgId");

-- CreateIndex
CREATE INDEX "ProfileVersion_orgId_scopeId_version_idx" ON "ProfileVersion"("orgId", "scopeId", "version");

-- CreateIndex
CREATE INDEX "Document_orgId_scopeId_idx" ON "Document"("orgId", "scopeId");

-- CreateIndex
CREATE INDEX "DocumentChunk_documentId_idx" ON "DocumentChunk"("documentId");

-- CreateIndex
CREATE INDEX "DocumentChunk_orgId_scopeId_idx" ON "DocumentChunk"("orgId", "scopeId");

-- CreateIndex
CREATE UNIQUE INDEX "Competitor_scopeId_identity_key" ON "Competitor"("scopeId", "identity");

-- CreateIndex
CREATE UNIQUE INDEX "SourceDocument_canonicalUrl_key" ON "SourceDocument"("canonicalUrl");

-- CreateIndex
CREATE INDEX "InsightRun_orgId_scopeId_acceptedAt_idx" ON "InsightRun"("orgId", "scopeId", "acceptedAt");

-- CreateIndex
CREATE INDEX "RunEvent_runId_id_idx" ON "RunEvent"("runId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Insight_scopeId_eventKey_key" ON "Insight"("scopeId", "eventKey");

-- CreateIndex
CREATE UNIQUE INDEX "InsightRevision_insightId_fingerprint_profileVersionId_key" ON "InsightRevision"("insightId", "fingerprint", "profileVersionId");
