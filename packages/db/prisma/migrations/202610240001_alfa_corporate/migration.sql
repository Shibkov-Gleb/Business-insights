-- CreateTable
CREATE TABLE "DatasetImport" (
    "id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'staging',
    "rows" INTEGER NOT NULL DEFAULT 0,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "report" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DatasetImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CorporateCompany" (
    "id" UUID NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "datasetId" UUID,
    "groupId" TEXT,
    "orgId" UUID,
    "scopeId" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "synthetic" BOOLEAN NOT NULL DEFAULT false,
    "unknown" BOOLEAN NOT NULL DEFAULT false,
    "fields" JSONB NOT NULL DEFAULT '{}',
    "conflicts" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "revenue" DECIMAL(30,6),
    "sourceRow" INTEGER,

    CONSTRAINT "CorporateCompany_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyVariant" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "datasetId" UUID NOT NULL,
    "sourceRow" INTEGER NOT NULL,
    "fields" JSONB NOT NULL,

    CONSTRAINT "CompanyVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonCompanyLink" (
    "id" BIGSERIAL NOT NULL,
    "datasetId" UUID NOT NULL,
    "personId" TEXT NOT NULL,
    "companyExternalId" TEXT NOT NULL,
    "sourceRow" INTEGER NOT NULL,
    "fields" JSONB NOT NULL,

    CONSTRAINT "PersonCompanyLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentEdge" (
    "id" BIGSERIAL NOT NULL,
    "datasetId" UUID NOT NULL,
    "sourceRow" INTEGER NOT NULL,
    "payer" TEXT NOT NULL,
    "beneficiary" TEXT NOT NULL,
    "amount" DECIMAL(38,6) NOT NULL,
    "count" BIGINT NOT NULL,

    CONSTRAINT "PaymentEdge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyGrant" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "canEdit" BOOLEAN NOT NULL DEFAULT false,
    "role" TEXT NOT NULL DEFAULT 'employee',
    "interests" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "CompanyGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankMaterial" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "publishedAt" TIMESTAMPTZ,
    "dateStatus" TEXT NOT NULL DEFAULT 'unknown',
    "status" TEXT NOT NULL DEFAULT 'queued',
    "pages" INTEGER NOT NULL DEFAULT 0,
    "coverage" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankPage" (
    "id" UUID NOT NULL,
    "materialId" UUID NOT NULL,
    "page" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "quality" DOUBLE PRECISION NOT NULL,
    "boxes" JSONB NOT NULL DEFAULT '[]',
    "numericVerified" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "BankPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CorporateNews" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "url" TEXT,
    "sha256" TEXT NOT NULL,
    "publishedAt" TIMESTAMPTZ,
    "origin" TEXT NOT NULL,
    "createdBy" UUID NOT NULL,
    "synthetic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CorporateNews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CorporateInsight" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "runId" UUID NOT NULL,
    "newsId" UUID NOT NULL,
    "contextVersion" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "evidence" JSONB NOT NULL,
    "score" INTEGER NOT NULL,
    "channels" TEXT[],
    "synthetic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CorporateInsight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CorporateTrace" (
    "id" UUID NOT NULL,
    "runId" UUID NOT NULL,
    "stage" TEXT NOT NULL,
    "tool" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CorporateTrace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CorporateChat" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "insightId" UUID,
    "role" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT,
    "evidence" JSONB NOT NULL DEFAULT '[]',
    "runId" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CorporateChat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CorporateFeedback" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "insightId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "verdict" TEXT NOT NULL,
    "comment" TEXT NOT NULL,
    "reviewStatus" TEXT NOT NULL DEFAULT 'open',
    "expertNote" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CorporateFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyBudget" (
    "id" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "cap" BIGINT NOT NULL,
    "reserved" BIGINT NOT NULL DEFAULT 0,
    "spent" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "DailyBudget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetReservation" (
    "id" UUID NOT NULL,
    "budgetId" TEXT NOT NULL,
    "runId" UUID NOT NULL,
    "model" TEXT NOT NULL,
    "estimated" BIGINT NOT NULL,
    "actual" BIGINT,
    "status" TEXT NOT NULL DEFAULT 'reserved',
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BudgetReservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DatasetImport_sha256_key" ON "DatasetImport"("sha256");

-- CreateIndex
CREATE UNIQUE INDEX "CorporateCompany_externalId_key" ON "CorporateCompany"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "CorporateCompany_scopeId_key" ON "CorporateCompany"("scopeId");

-- CreateIndex
CREATE INDEX "CorporateCompany_groupId_idx" ON "CorporateCompany"("groupId");

-- CreateIndex
CREATE INDEX "CorporateCompany_datasetId_revenue_idx" ON "CorporateCompany"("datasetId", "revenue");

-- CreateIndex
CREATE INDEX "CompanyVariant_companyId_idx" ON "CompanyVariant"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyVariant_datasetId_sourceRow_key" ON "CompanyVariant"("datasetId", "sourceRow");

-- CreateIndex
CREATE INDEX "PersonCompanyLink_companyExternalId_idx" ON "PersonCompanyLink"("companyExternalId");

-- CreateIndex
CREATE INDEX "PersonCompanyLink_personId_idx" ON "PersonCompanyLink"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "PersonCompanyLink_datasetId_sourceRow_key" ON "PersonCompanyLink"("datasetId", "sourceRow");

-- CreateIndex
CREATE INDEX "PaymentEdge_payer_amount_idx" ON "PaymentEdge"("payer", "amount");

-- CreateIndex
CREATE INDEX "PaymentEdge_beneficiary_amount_idx" ON "PaymentEdge"("beneficiary", "amount");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentEdge_datasetId_sourceRow_key" ON "PaymentEdge"("datasetId", "sourceRow");

-- CreateIndex
CREATE INDEX "CompanyGrant_companyId_idx" ON "CompanyGrant"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyGrant_userId_companyId_key" ON "CompanyGrant"("userId", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "BankMaterial_sha256_key" ON "BankMaterial"("sha256");

-- CreateIndex
CREATE UNIQUE INDEX "BankPage_materialId_page_key" ON "BankPage"("materialId", "page");

-- CreateIndex
CREATE INDEX "CorporateNews_companyId_publishedAt_idx" ON "CorporateNews"("companyId", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CorporateNews_companyId_sha256_key" ON "CorporateNews"("companyId", "sha256");

-- CreateIndex
CREATE INDEX "CorporateInsight_companyId_createdAt_id_idx" ON "CorporateInsight"("companyId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CorporateInsight_companyId_newsId_contextVersion_key" ON "CorporateInsight"("companyId", "newsId", "contextVersion");

-- CreateIndex
CREATE INDEX "CorporateTrace_runId_createdAt_idx" ON "CorporateTrace"("runId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CorporateChat_runId_key" ON "CorporateChat"("runId");

-- CreateIndex
CREATE INDEX "CorporateChat_companyId_userId_createdAt_idx" ON "CorporateChat"("companyId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "CorporateFeedback_companyId_createdAt_idx" ON "CorporateFeedback"("companyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DailyBudget_keyHash_day_key" ON "DailyBudget"("keyHash", "day");

-- CreateIndex
CREATE INDEX "BudgetReservation_budgetId_status_idx" ON "BudgetReservation"("budgetId", "status");

-- CreateIndex
CREATE INDEX "BudgetReservation_runId_idx" ON "BudgetReservation"("runId");
