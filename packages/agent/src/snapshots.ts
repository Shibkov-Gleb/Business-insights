import { db } from "@context/db";
import { canonicalUrl, digest, type RetrievedSource } from "./sources.ts";
export async function captureSource(run: { id: string; orgId: string; scopeId: string }, source: RetrievedSource) {
  const url = canonicalUrl(source.url), checksum = digest(source.text);
  return db.$transaction(async tx => {
    // A retry of the same node reuses the same captured content within this run.
    const links = await tx.runSource.findMany({ where: { runId: run.id } });
    const existing = await tx.sourceSnapshot.findFirst({ where: { id: { in: links.map(x => x.sourceSnapshotId) }, canonicalUrl: url, checksum } });
    if (existing) return existing;
    const snapshot = await tx.sourceSnapshot.create({ data: {
      canonicalUrl: url, title: source.title, text: source.text, checksum,
      status: source.status, publishedAt: source.publishedAt ? new Date(source.publishedAt) : null,
    } });
    await tx.runSource.create({ data: { orgId: run.orgId, scopeId: run.scopeId, runId: run.id, sourceSnapshotId: snapshot.id } });
    return snapshot;
  });
}
