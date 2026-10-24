import { expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { db, json } from "../../packages/db/src/index.ts";
import { app, finishRoutes } from "../../apps/api/src/app.ts";
import { companyContext } from "../../packages/db/src/corporate-context.ts";
import { corporateGraph } from "../../packages/agent/src/corporate.ts";
import { checkpointer } from "../../packages/agent/src/graphs.ts";
import { newSession } from "../../apps/api/src/core.ts";
import {
  corporateAssessment,
  corporateEvidence,
} from "../../packages/contracts/src/corporate.ts";
import { z } from "zod";
import { deterministicAssessment } from "../../packages/agent/src/corporate-rules.ts";
finishRoutes();
async function setup() {
  const user = await db.user.create({
    data: {
      email: randomUUID() + "@flow.test",
      passwordHash: "not-a-login",
      verified: true,
    },
  });
  const other = await db.user.create({
    data: {
      email: randomUUID() + "@flow.test",
      passwordHash: "not-a-login",
      verified: true,
    },
  });
  const org = await db.organization.create({
    data: {
      name: "Corporate flow test",
      stage: "established",
      description: "Synthetic corporate integration fixture",
    },
  });
  await db.membership.createMany({
    data: [user, other].map((u) => ({
      userId: u.id,
      orgId: org.id,
      role: "owner",
    })),
  });
  const scope = await db.analysisScope.create({
    data: { orgId: org.id, name: "Flow company" },
  });
  const company = await db.corporateCompany.create({
    data: {
      externalId: randomUUID(),
      name: "Synthetic flow corporation",
      synthetic: true,
      orgId: org.id,
      scopeId: scope.id,
      fields: {
        MAINOKVED_NAME: "Производство стали",
        CL_PRODUCT_LOA_MARK: "1.0",
        FTS_FLAG: "1.0",
      },
    },
  });
  await db.companyGrant.create({
    data: {
      userId: user.id,
      companyId: company.id,
      canEdit: true,
      role: "cfo",
    },
  });
  const text =
    "Синтетическое событие: ключевая ставка сохраняется, условия новых корпоративных кредитов меняются. Требуется проверить даты рефинансирования и фактические договорные условия компании.";
  const news = await db.corporateNews.create({
    data: {
      companyId: company.id,
      title: "Ключевая ставка и корпоративный кредит",
      text,
      sha256: randomUUID(),
      origin: "fixture",
      synthetic: true,
      createdBy: user.id,
    },
  });
  const run = await db.insightRun.create({
    data: {
      orgId: org.id,
      scopeId: scope.id,
      userId: user.id,
      resourceId: company.id,
      kind: "corporate",
      status: "testing",
      windowFrom: new Date(Date.now() - 86400000),
      windowTo: new Date(),
      snapshot: json({
        context: await companyContext(company.id),
        input: { expectedVersion: 1, newsIds: [news.id], search: false },
      }),
    },
  });
  return { user, other, company, run, scope, news };
}
it("корпоративный checkpoint возобновляется перед публикацией без повторов и без движения news cursor", async () => {
  const f = await setup();
  await checkpointer.setup();
  await corporateGraph(f.run.id, { interruptBefore: ["persist"] });
  expect(await db.corporateInsight.count({ where: { runId: f.run.id } })).toBe(
    0,
  );
  const count = await db.corporateTrace.count({
    where: { runId: f.run.id, stage: "interpret" },
  });
  await db.insightRun.update({
    where: { id: f.run.id },
    data: { status: "running" },
  });
  await corporateGraph(f.run.id);
  await corporateGraph(f.run.id);
  const rows = await db.corporateInsight.findMany({
    where: { runId: f.run.id },
  });
  expect(rows).toHaveLength(1);
  expect(
    await db.corporateInsightRevision.count({
      where: { insightId: rows[0].id },
    }),
  ).toBe(1);
  expect(
    await db.corporateTrace.count({
      where: { runId: f.run.id, stage: "interpret" },
    }),
  ).toBe(count);
  expect(
    (await db.analysisScope.findUniqueOrThrow({ where: { id: f.scope.id } }))
      .cursorAt,
  ).toBeNull();
  expect(corporateAssessment.parse(rows[0].data).companyFeatureKeys).toContain(
    "CL_PRODUCT_LOA_MARK",
  );
  expect(
    z
      .array(corporateEvidence)
      .parse(rows[0].evidence)
      .some((e) => e.kind === "news" && f.news.text.includes(e.quote)),
  ).toBe(true);
}, 60000);
it("обновление банковского корпуса создаёт ревизию, повтор сохраняет единственную публикацию", async () => {
  const f = await setup();
  await checkpointer.setup();
  const publish = async (runId: string) => {
    await corporateGraph(runId, { interruptBefore: ["persist"] });
    await db.insightRun.update({
      where: { id: runId },
      data: { status: "running" },
    });
    await corporateGraph(runId);
  };
  await publish(f.run.id);
  const before = await db.corporateInsight.findFirstOrThrow({
    where: { companyId: f.company.id },
  });
  const material = await db.bankMaterial.create({
    data: {
      title: "Unrelated synthetic version fixture",
      filename: "fixture.pdf",
      sha256: randomUUID(),
      storageKey: "fixture",
      status: "ready",
    },
  });
  try {
    const next = await db.insightRun.create({
      data: {
        orgId: f.run.orgId,
        scopeId: f.run.scopeId,
        userId: f.run.userId,
        resourceId: f.company.id,
        kind: "corporate",
        status: "testing",
        windowFrom: f.run.windowFrom,
        windowTo: f.run.windowTo,
        id: randomUUID(),
        acceptedAt: new Date(),
        snapshot: json({
          context: await companyContext(f.company.id),
          input: { expectedVersion: 1, newsIds: [], search: false },
        }),
      },
    });
    await publish(next.id);
    const current = await db.corporateInsight.findFirstOrThrow({
      where: { companyId: f.company.id },
    });
    expect(current.id).toBe(before.id);
    expect(current.analysisKey).not.toBe(before.analysisKey);
    expect(
      await db.corporateInsightRevision.count({
        where: { insightId: before.id },
      }),
    ).toBe(2);
    await corporateGraph(next.id);
    expect(
      await db.corporateInsightRevision.count({
        where: { insightId: before.id },
      }),
    ).toBe(2);
    const original = await db.corporateInsightRevision.findUniqueOrThrow({
      where: { id: before.latestRevisionId! },
    });
    expect(original.data).toEqual(before.data);
    expect(original.runId).toBe(f.run.id);
  } finally {
    await db.bankMaterial.delete({ where: { id: material.id } });
  }
}, 60000);
it("ручные уточнения конфликтуют по версии, сохраняют исходник и immutable историю", async () => {
  const f = await setup(),
    cookies: string[] = [];
  const csrf = await newSession(
    {} as Parameters<typeof newSession>[0],
    {
      cookie(name: string, value: string) {
        cookies.push(name + "=" + value);
      },
    } as unknown as Parameters<typeof newSession>[1],
    f.user.id,
  );
  const update = (value: string) =>
    request(app)
      .patch(`/api/v1/bank/companies/${f.company.id}/context`)
      .set("Cookie", cookies)
      .set("Origin", "http://localhost:3000")
      .set("X-CSRF-Token", csrf)
      .send({
        expectedVersion: 1,
        confirm: true,
        fields: { CL_PRODUCT_LOA_MARK: value },
      });
  const responses = await Promise.all([update("0.0"), update("1.0")]);
  expect(responses.map((x) => x.status).sort()).toEqual([200, 409]);
  const c = await db.corporateCompany.findUniqueOrThrow({
    where: { id: f.company.id },
  });
  expect(c.version).toBe(2);
  expect((c.fields as Record<string, unknown>).CL_PRODUCT_LOA_MARK).toBe("1.0");
  expect(
    (await companyContext(c.id)).facts.find(
      (x) => x.key === "CL_PRODUCT_LOA_MARK",
    )?.origin,
  ).toBe("user");
  expect(
    await db.profileVersion.count({ where: { scopeId: f.scope.id } }),
  ).toBe(2);
});
it("лента фильтрует доступ до LIMIT, cursor не теряет записи, число SQL не растёт на карточку", async () => {
  const f = await setup(),
    cookies: string[] = [];
  await newSession(
    {} as Parameters<typeof newSession>[0],
    {
      cookie(name: string, value: string) {
        cookies.push(name + "=" + value);
      },
    } as unknown as Parameters<typeof newSession>[1],
    f.user.id,
  );
  const context = await companyContext(f.company.id),
    data = deterministicAssessment(context, f.news.title, f.news.text, []);
  for (let n = 0; n < 18; n++) {
    const news = await db.corporateNews.create({
      data: {
        companyId: f.company.id,
        title: "Pagination fixture",
        text: f.news.text + n,
        sha256: randomUUID(),
        origin: "fixture",
        createdBy: f.user.id,
      },
    });
    await db.corporateInsight.create({
      data: {
        companyId: f.company.id,
        runId: f.run.id,
        newsId: news.id,
        contextVersion: 1,
        score: 100 + n,
        channels: data.channels,
        data: json(data),
        evidence: [],
        synthetic: true,
      },
    });
  }
  const previous = await db.corporateInsight.findFirstOrThrow({
    where: { companyId: f.company.id },
  });
  await db.corporateInsight.create({
    data: {
      companyId: f.company.id,
      runId: f.run.id,
      newsId: previous.newsId,
      contextVersion: 2,
      score: 500,
      channels: data.channels,
      data: json({ ...data, title: "Новая версия оценки" }),
      evidence: [],
      synthetic: true,
    },
  });
  const fixtures = await db.corporateInsight.findMany({
    where: { companyId: f.company.id },
  });
  await db.corporateInsightRevision.createMany({
    data: fixtures.map((i) => ({
      companyId: i.companyId,
      insightId: i.id,
      runId: i.runId,
      fingerprint: "fixture",
      analysisKey: "fixture",
      contextVersion: i.contextVersion,
      data: json(i.data),
      evidence: [],
      score: i.score,
      channels: i.channels,
      synthetic: true,
      createdAt: i.createdAt,
    })),
  });
  const sql = vi.spyOn(db, "$queryRaw");
  try {
    const one = await request(app)
      .get(`/api/v1/bank/companies/${f.company.id}/feed?limit=1`)
      .set("Cookie", cookies);
    expect(one.status).toBe(200);
    expect(sql).toHaveBeenCalledTimes(1);
    sql.mockClear();
    const many = await request(app)
      .get(`/api/v1/bank/companies/${f.company.id}/feed?limit=15`)
      .set("Cookie", cookies);
    expect(many.body.items).toHaveLength(15);
    expect(sql).toHaveBeenCalledTimes(1);
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const page: request.Response = await request(app)
        .get(
          `/api/v1/bank/companies/${f.company.id}/feed?limit=4${cursor ? "&cursor=" + encodeURIComponent(cursor) : ""}`,
        )
        .set("Cookie", cookies);
      expect(page.status).toBe(200);
      seen.push(...page.body.items.map((x: { id: string }) => x.id));
      cursor = page.body.nextCursor;
    } while (cursor);
    expect(seen).toHaveLength(18);
    expect(new Set(seen).size).toBe(18);
    const wrong = await request(app)
      .get(
        `/api/v1/bank/companies/${f.company.id}/feed?role=accountant&cursor=${encodeURIComponent(many.body.nextCursor)}`,
      )
      .set("Cookie", cookies);
    expect(wrong.status).toBe(422);
  } finally {
    sql.mockRestore();
  }
}, 60000);
it("owner одной организации без company grant не читает контекст, источники, jobs и SSE", async () => {
  const f = await setup();
  const cookie: string[] = [];
  const fakeReq = { sessionId: undefined } as Parameters<typeof newSession>[0];
  const fakeRes = {
    cookie(name: string, value: string) {
      cookie.push(name + "=" + value);
    },
  } as unknown as Parameters<typeof newSession>[1];
  await newSession(fakeReq, fakeRes, f.other.id);
  for (const url of [
    `/api/v1/bank/companies/${f.company.id}/context`,
    `/api/v1/bank/companies/${f.company.id}/evidence?kind=csv`,
    `/api/v1/jobs/${f.run.id}`,
    `/api/v1/jobs/${f.run.id}/events`,
  ]) {
    const res = await request(app).get(url).set("Cookie", cookie);
    expect(res.status).toBe(404);
  }
  const list = await request(app)
    .get("/api/v1/bank/companies")
    .set("Cookie", cookie);
  expect(list.body.items).toHaveLength(0);
});
it("отзыв company grant отменяет отложенный run и удаляет чувствительный checkpoint", async () => {
  const f = await setup();
  await checkpointer.setup();
  await corporateGraph(f.run.id, { interruptBefore: ["persist"] });
  await db.companyGrant.deleteMany({
    where: { userId: f.user.id, companyId: f.company.id },
  });
  await db.insightRun.update({
    where: { id: f.run.id },
    data: { status: "queued" },
  });
  await db.outbox.create({ data: { id: f.run.id } });
  for (let n = 0; n < 150; n++) {
    const row = await db.insightRun.findUniqueOrThrow({
      where: { id: f.run.id },
    });
    if (row.status === "cancelled") break;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  expect(
    (await db.insightRun.findUniqueOrThrow({ where: { id: f.run.id } })).status,
  ).toBe("cancelled");
  expect(
    await checkpointer.getTuple({ configurable: { thread_id: f.run.id } }),
  ).toBeUndefined();
  expect(await db.corporateInsight.count({ where: { runId: f.run.id } })).toBe(
    0,
  );
}, 60000);
