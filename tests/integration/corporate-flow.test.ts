import { expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { db, json } from "../../packages/db/src/index.ts";
import { app, finishRoutes } from "../../apps/api/src/app.ts";
import { companyContext } from "../../packages/db/src/corporate-context.ts";
import { corporateGraph } from "../../packages/agent/src/corporate.ts";
import { checkpointer } from "../../packages/agent/src/graphs.ts";
import { newSession } from "../../apps/api/src/core.ts";
import { corporateAssessment, corporateEvidence } from "../../packages/contracts/src/corporate.ts";
import { z } from "zod";
finishRoutes();
async function setup() {
  const user = await db.user.create({ data: { email: randomUUID() + "@flow.test", passwordHash: "not-a-login", verified: true } });
  const other = await db.user.create({ data: { email: randomUUID() + "@flow.test", passwordHash: "not-a-login", verified: true } });
  const org = await db.organization.create({ data: { name: "Corporate flow test", stage: "established", description: "Synthetic corporate integration fixture" } });
  await db.membership.createMany({ data: [user, other].map(u => ({ userId: u.id, orgId: org.id, role: "owner" })) });
  const scope = await db.analysisScope.create({ data: { orgId: org.id, name: "Flow company" } });
  const company = await db.corporateCompany.create({ data: { externalId: randomUUID(), name: "Synthetic flow corporation", synthetic: true, orgId: org.id, scopeId: scope.id, fields: { MAINOKVED_NAME: "Производство стали", CL_PRODUCT_LOA_MARK: "1.0", FTS_FLAG: "1.0" } } });
  await db.companyGrant.create({ data: { userId: user.id, companyId: company.id, canEdit: true, role: "cfo" } });
  const text = "Синтетическое событие: ключевая ставка сохраняется, условия новых корпоративных кредитов меняются. Требуется проверить даты рефинансирования и фактические договорные условия компании.";
  const news = await db.corporateNews.create({ data: { companyId: company.id, title: "Ключевая ставка и корпоративный кредит", text, sha256: randomUUID(), origin: "fixture", synthetic: true, createdBy: user.id } });
  const run = await db.insightRun.create({ data: { orgId: org.id, scopeId: scope.id, userId: user.id, resourceId: company.id, kind: "corporate", status: "testing", windowFrom: new Date(Date.now() - 86400000), windowTo: new Date(), snapshot: json({ context: await companyContext(company.id), input: { expectedVersion: 1, newsIds: [news.id], search: false } }) } });
  return { user, other, company, run, scope, news };
}
it("корпоративный checkpoint возобновляется перед публикацией без повторов и без движения news cursor", async () => {
  const f = await setup(); await checkpointer.setup();
  await corporateGraph(f.run.id, { interruptBefore: ["persist"] });
  expect(await db.corporateInsight.count({ where: { runId: f.run.id } })).toBe(0);
  const count = await db.corporateTrace.count({ where: { runId: f.run.id, stage: "interpret" } });
  await db.insightRun.update({ where: { id: f.run.id }, data: { status: "running" } });
  await corporateGraph(f.run.id); await corporateGraph(f.run.id);
  const rows = await db.corporateInsight.findMany({ where: { runId: f.run.id } }); expect(rows).toHaveLength(1);
  expect(await db.corporateTrace.count({ where: { runId: f.run.id, stage: "interpret" } })).toBe(count);
  expect((await db.analysisScope.findUniqueOrThrow({ where: { id: f.scope.id } })).cursorAt).toBeNull();
  expect(corporateAssessment.parse(rows[0].data).companyFeatureKeys).toContain("CL_PRODUCT_LOA_MARK");
  expect(z.array(corporateEvidence).parse(rows[0].evidence).some(e => e.kind === "news" && f.news.text.includes(e.quote))).toBe(true);
}, 60000);
it("owner одной организации без company grant не читает контекст, источники, jobs и SSE", async () => {
  const f = await setup();
  const cookie: string[] = [];
  const fakeReq = { sessionId: undefined } as Parameters<typeof newSession>[0];
  const fakeRes = { cookie(name: string, value: string) { cookie.push(name + "=" + value); } } as unknown as Parameters<typeof newSession>[1];
  await newSession(fakeReq, fakeRes, f.other.id);
  for (const url of [`/api/v1/bank/companies/${f.company.id}/context`, `/api/v1/bank/companies/${f.company.id}/evidence?kind=csv`, `/api/v1/jobs/${f.run.id}`, `/api/v1/jobs/${f.run.id}/events`]) { const res = await request(app).get(url).set("Cookie", cookie); expect(res.status).toBe(404); }
  const list = await request(app).get("/api/v1/bank/companies").set("Cookie", cookie); expect(list.body.items).toHaveLength(0);
});
it("отзыв company grant отменяет отложенный run и удаляет чувствительный checkpoint", async () => {
  const f = await setup(); await checkpointer.setup();
  await corporateGraph(f.run.id, { interruptBefore: ["persist"] });
  await db.companyGrant.deleteMany({ where: { userId: f.user.id, companyId: f.company.id } });
  await db.insightRun.update({ where: { id: f.run.id }, data: { status: "queued" } });
  await db.outbox.create({ data: { id: f.run.id } });
  for (let n = 0; n < 150; n++) { const row = await db.insightRun.findUniqueOrThrow({ where: { id: f.run.id } }); if (row.status === "cancelled") break; await new Promise(resolve => setTimeout(resolve, 200)); }
  expect((await db.insightRun.findUniqueOrThrow({ where: { id: f.run.id } })).status).toBe("cancelled");
  expect(await checkpointer.getTuple({ configurable: { thread_id: f.run.id } })).toBeUndefined();
  expect(await db.corporateInsight.count({ where: { runId: f.run.id } })).toBe(0);
}, 60000);
