-- Ordered accessible feed and evidence lookup stay independent of page size.
CREATE INDEX "Insight_feed_scope_idx" ON "Insight" ("orgId", "scopeId", "severity" ASC, "updatedAt" DESC, "id" DESC);
CREATE INDEX "Insight_feed_org_idx" ON "Insight" ("orgId", "severity" ASC, "updatedAt" DESC, "id" DESC);
CREATE INDEX "InsightRevision_evidence_idx" ON "InsightRevision" USING GIN ("evidence" jsonb_path_ops);
