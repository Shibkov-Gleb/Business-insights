CREATE TABLE "Event" (
 "id" UUID PRIMARY KEY, "orgId" UUID NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
 "scopeId" UUID NOT NULL REFERENCES "AnalysisScope"("id") ON DELETE CASCADE,
 "identity" TEXT NOT NULL, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "Event_scopeId_identity_key" ON "Event"("scopeId","identity");
CREATE TABLE "EventRevision" (
 "id" UUID PRIMARY KEY, "orgId" UUID NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
 "scopeId" UUID NOT NULL REFERENCES "AnalysisScope"("id") ON DELETE CASCADE,
 "eventId" UUID NOT NULL REFERENCES "Event"("id") ON DELETE CASCADE,
 "fingerprint" TEXT NOT NULL, "sourceIds" JSONB NOT NULL, "summary" TEXT NOT NULL,
 "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "EventRevision_eventId_fingerprint_key" ON "EventRevision"("eventId","fingerprint");
