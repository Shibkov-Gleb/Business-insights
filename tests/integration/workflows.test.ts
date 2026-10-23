import { beforeAll, afterAll, describe, it, expect } from "vitest";
import request from "supertest";
import argon2 from "argon2";
import { randomUUID } from "node:crypto";
import { app, finishRoutes } from "../../apps/api/src/app.ts";
import { db, json } from "@context/db";
import {
  redis,
  hash,
  token,
  effectiveProfile,
} from "../../apps/api/src/core.ts";
import {
  checkpointer,
  analysisGraph,
} from "../../packages/agent/src/graphs.ts";
import { enqueue } from "../../packages/db/src/jobs.ts";
import { Queue } from "bullmq";
import { spawn, type ChildProcess } from "node:child_process";
import { config } from "@context/config";
import { digest } from "../../packages/agent/src/sources.ts";
let replacement: ChildProcess | undefined;
const origin = "http://localhost:3000";
finishRoutes();
type Client = {
  agent: ReturnType<typeof request.agent>;
  csrf: string;
  userId: string;
};
async function login(email: string): Promise<Client> {
  const user = await db.user.create({
    data: {
      email,
      passwordHash: await argon2.hash("Integration-password-2026!"),
      verified: true,
    },
  });
  const agent = request.agent(app);
  const guest = await agent.get("/api/v1/auth/csrf");
  const result = await agent
    .post("/api/v1/auth/login")
    .set("Origin", origin)
    .set("X-CSRF-Token", guest.body.csrfToken)
    .send({ email, password: "Integration-password-2026!" });
  expect(result.status).toBe(200);
  return { agent, csrf: result.body.csrfToken, userId: user.id };
}
const post = (c: Client, path: string, body: object, key = randomUUID()) =>
  c.agent
    .post("/api/v1" + path)
    .set("Origin", origin)
    .set("X-CSRF-Token", c.csrf)
    .set("Idempotency-Key", key)
    .send(body)
    .then((r) => {
      if (r.body.csrfToken) c.csrf = r.body.csrfToken;
      return r;
    });
const patch = (c: Client, path: string, body: object) =>
  c.agent
    .patch("/api/v1" + path)
    .set("Origin", origin)
    .set("X-CSRF-Token", c.csrf)
    .send(body);
async function waitJob(c: Client, id: string) {
  for (let i = 0; i < 100; i++) {
    const r = await c.agent.get("/api/v1/jobs/" + id);
    if (["succeeded", "failed", "partial", "cancelled"].includes(r.body.status))
      return r.body;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("JOB_TIMEOUT");
}
let owner: Client,
  reader: Client,
  stranger: Client,
  orgId: string,
  scopeId: string,
  otherScope: string,
  insightId: string;
beforeAll(async () => {
  owner = await login("owner@test.example");
  reader = await login("reader@test.example");
  stranger = await login("stranger@test.example");
  const org = await post(owner, "/organizations", {
    name: "Test idea",
    stage: "idea",
    description: "B2B SaaS автоматизация отчётности для небольших команд",
  });
  expect(org.status).toBe(201);
  orgId = org.body.id;
  scopeId = (await owner.agent.get(`/api/v1/organizations/${orgId}/scopes`))
    .body.items[0].id;
  otherScope = (
    await post(owner, `/organizations/${orgId}/scopes`, {
      name: "Закрытые закупки",
    })
  ).body.id;
}, 30000);
afterAll(async () => {
  replacement?.kill("SIGTERM");
  await checkpointer.end();
  await redis.quit();
  await db.$disconnect();
});
describe("Полные сценарии с PostgreSQL и Redis", () => {
  it("CSRF, Origin и доступ чужой организации", async () => {
    expect(
      (await owner.agent.post("/api/v1/organizations").send({})).status,
    ).toBe(403);
    expect(
      (await stranger.agent.get(`/api/v1/organizations/${orgId}`)).status,
    ).toBe(404);
  });
  it("ошибка JSON содержит безопасный контракт и requestId", async () => {
    const response = await owner.agent
      .post("/api/v1/organizations")
      .set("Content-Type", "application/json")
      .send("{");
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("INVALID_JSON");
    expect(response.body.error.requestId).toMatch(/^[a-f0-9-]{36}$/);
  });
  it("подтверждение email одноразовое", async () => {
    const u = await db.user.create({
      data: { email: "verify@test.example", passwordHash: "not-used" },
    });
    const raw = token();
    await db.authToken.create({
      data: {
        id: hash(raw),
        userId: u.id,
        kind: "verify",
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    expect(
      (await post(owner, "/auth/verify-email", { token: raw })).status,
    ).toBe(200);
    expect(
      (await post(owner, "/auth/verify-email", { token: raw })).status,
    ).toBe(400);
  });
  it("приглашение ограничивает направления и не принимается дважды", async () => {
    const invitation = await post(
      owner,
      `/organizations/${orgId}/invitations`,
      {
        email: "reader@test.example",
        role: "reader",
        allScopes: false,
        scopeIds: [scopeId],
      },
    );
    const raw = new URL(invitation.body.url).searchParams.get("token");
    expect(
      (await post(reader, "/invitations/accept", { token: raw })).status,
    ).toBe(200);
    expect(
      (await post(reader, "/invitations/accept", { token: raw })).status,
    ).toBe(400);
    expect(
      (
        await reader.agent.get(
          `/api/v1/organizations/${orgId}/scopes/${otherScope}`,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await post(
          reader,
          `/organizations/${orgId}/scopes/${scopeId}/insight-runs`,
          { mode: "normal" },
        )
      ).status,
    ).toBe(403);
  });
  it("версии профиля конфликтуют, гипотеза сохраняется", async () => {
    const path = `/organizations/${orgId}/profile`;
    const r = await patch(owner, path, {
      expectedVersion: 1,
      fields: { audience: { value: "B2B", assertion: "hypothesis" } },
    });
    expect(r.status).toBe(200);
    expect(r.body.fields.audience.assertion).toBe("hypothesis");
    expect(
      (await patch(owner, path, { expectedVersion: 1, fields: {} })).status,
    ).toBe(409);
  });
  it("конкурентные POST создают один run; cursor совпадает с accepted window", async () => {
    const path = `/organizations/${orgId}/scopes/${scopeId}/insight-runs`;
    const [a, b] = await Promise.all([
      post(owner, path, { mode: "normal" }),
      post(owner, path, { mode: "normal" }),
    ]);
    expect(a.status).toBe(202);
    expect(b.body.jobId).toBe(a.body.jobId);
    const done = await waitJob(owner, a.body.jobId);
    expect(done.status).toBe("succeeded");
    expect(done.windowTo).toBe(done.acceptedAt);
    expect(Date.parse(done.windowTo) - Date.parse(done.windowFrom)).toBe(
      30 * 86400000,
    );
    expect(
      (
        await db.analysisScope.findUniqueOrThrow({ where: { id: scopeId } })
      ).cursorAt!.toISOString(),
    ).toBe(done.windowTo);
    const feed = (
      await owner.agent.get(
        `/api/v1/organizations/${orgId}/insights?scopeId=${scopeId}`,
      )
    ).body;
    expect(feed.items.length).toBeGreaterThan(0);
    insightId = feed.items[0].id;
    expect(
      (await stranger.agent.get("/api/v1/jobs/" + a.body.jobId)).status,
    ).toBe(404);
  }, 40000);
  it("повтор ключа возвращает прежний run, иной payload даёт конфликт", async () => {
    const path = `/organizations/${orgId}/scopes/${otherScope}/insight-runs`,
      key = randomUUID();
    const a = await post(owner, path, { mode: "normal" }, key);
    await waitJob(owner, a.body.jobId);
    const b = await post(owner, path, { mode: "normal" }, key);
    expect(b.body.jobId).toBe(a.body.jobId);
    const c = await post(
      owner,
      path,
      {
        mode: "historical_rescan",
        from: "2026-01-01T00:00:00Z",
        to: "2026-02-01T00:00:00Z",
      },
      key,
    );
    expect(c.status).toBe(409);
  }, 40000);
  it("приватный чат не доступен команде до share; reader может задавать вопросы", async () => {
    const chat = await post(owner, `/organizations/${orgId}/chats`, {
      scopeId,
      insightId,
      title: "Обсуждение",
    });
    const path = `/organizations/${orgId}/chats/${chat.body.id}`;
    expect((await reader.agent.get("/api/v1" + path)).status).toBe(404);
    expect(
      (
        await patch(owner, path + "/visibility", {
          visibility: "shared",
          confirmEntireThread: true,
        })
      ).status,
    ).toBe(200);
    const msg = await post(reader, path + "/messages", {
      text: "Какие допущения следует проверить?",
    });
    expect(msg.status).toBe(202);
    expect((await waitJob(reader, msg.body.jobId)).status).toBe("succeeded");
    const history = await reader.agent.get("/api/v1" + path);
    expect(history.body.messages.at(-1).content).toContain("демонстрационный");
  }, 40000);
  it("документ обрабатывается и удаление исключает его текст", async () => {
    const f = await owner.agent
      .post(`/api/v1/organizations/${orgId}/documents`)
      .set("Origin", origin)
      .set("X-CSRF-Token", owner.csrf)
      .set("Idempotency-Key", randomUUID())
      .field("scopeId", scopeId)
      .attach(
        "file",
        Buffer.from(
          "B2B SaaS. Synthetic business context and hypotheses for testing.",
        ),
        { filename: "context.txt", contentType: "text/plain" },
      );
    expect(f.status).toBe(202);
    expect((await waitJob(owner, f.body.jobId)).status).toBe("succeeded");
    const path = `/api/v1/organizations/${orgId}/documents/${f.body.documentId}`;
    expect(
      (await owner.agent.get(path + "/chunks")).body.items.length,
    ).toBeGreaterThan(0);
    expect((await stranger.agent.get(path + "/chunks")).status).toBe(404);
    const proposals = (
      await owner.agent.get(
        `/api/v1/organizations/${orgId}/scopes/${scopeId}/profile-proposals`,
      )
    ).body.items;
    const proposal = proposals.find(
      (p: any) => p.documentId === f.body.documentId,
    );
    expect(proposal).toBeTruthy();
    const profilePath = `/organizations/${orgId}/scopes/${scopeId}/profile`;
    expect(
      (
        await patch(owner, profilePath, {
          expectedVersion: 0,
          fields: { hypotheses: { value: "Тест", assertion: "hypothesis" } },
        })
      ).status,
    ).toBe(200);
    const confirmPath = `/organizations/${orgId}/scopes/${scopeId}/profile-proposals/${proposal.id}/confirm`;
    expect(
      (
        await post(owner, confirmPath, {
          expectedVersion: 0,
          fields: proposal.fields,
        })
      ).status,
    ).toBe(409);
    const confirmed = await post(owner, confirmPath, {
      expectedVersion: 1,
      fields: proposal.fields,
    });
    expect(confirmed.body.fields.documentSummary.assertion).toBe("hypothesis");
    const removed = await owner.agent
      .delete(path)
      .set("Origin", origin)
      .set("X-CSRF-Token", owner.csrf);
    expect(removed.status).toBe(200);
    expect((await owner.agent.get(path + "/chunks")).body.items).toHaveLength(
      0,
    );
    expect((await owner.agent.get(path + "/download")).status).toBe(410);
    expect((await effectiveProfile(orgId, scopeId)).fields).not.toHaveProperty(
      "documentSummary",
    );
  }, 40000);

  it("приглашения истекают, отзываются; последний owner защищён", async () => {
    const create = () =>
      post(owner, `/organizations/${orgId}/invitations`, {
        role: "analyst",
        allScopes: true,
      });
    const expired = await create();
    await db.invitation.update({
      where: { id: expired.body.id },
      data: { expiresAt: new Date(0) },
    });
    expect(
      (
        await post(reader, "/invitations/accept", {
          token: new URL(expired.body.url).searchParams.get("token"),
        })
      ).status,
    ).toBe(400);
    const revoked = await create();
    expect(
      (
        await owner.agent
          .delete(
            `/api/v1/organizations/${orgId}/invitations/${revoked.body.id}`,
          )
          .set("Origin", origin)
          .set("X-CSRF-Token", owner.csrf)
      ).status,
    ).toBe(200);
    expect(
      (
        await post(reader, "/invitations/accept", {
          token: new URL(revoked.body.url).searchParams.get("token"),
        })
      ).status,
    ).toBe(400);
    const member = await db.membership.findUniqueOrThrow({
      where: { orgId_userId: { orgId, userId: owner.userId } },
    });
    expect(
      (
        await patch(owner, `/organizations/${orgId}/members/${member.id}`, {
          role: "reader",
          allScopes: true,
          scopeIds: [],
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await patch(reader, `/organizations/${orgId}/profile`, {
          expectedVersion: 2,
          fields: {},
        })
      ).status,
    ).toBe(403);
  });
  it("конкуренты имеют основания; отклонённое предложение не возвращается", async () => {
    const path = `/organizations/${orgId}/scopes/${scopeId}`;
    const first = await post(owner, path + "/competitor-searches", {});
    expect((await waitJob(owner, first.body.jobId)).status).toBe("succeeded");
    const rows = (await owner.agent.get("/api/v1" + path + "/competitors")).body
      .items;
    expect(rows[0].data.sources.length).toBeGreaterThan(0);
    await post(
      owner,
      path + "/competitor-proposals/" + rows[0].id + "/decision",
      { decision: "rejected" },
    );
    const second = await post(owner, path + "/competitor-searches", {});
    await waitJob(owner, second.body.jobId);
    expect(
      (await owner.agent.get("/api/v1" + path + "/competitors")).body.items[0]
        .decision,
    ).toBe("rejected");
    expect(
      (
        await patch(owner, path + "/competitors/" + rows[0].id, {
          name: "Исправлено вручную",
          monitoring: "disabled",
        })
      ).body.name,
    ).toBe("Исправлено вручную");
  }, 40000);
  it("partial, cancel, rescan и пустой успешный run соблюдают cursor", async () => {
    const fresh = await post(owner, `/organizations/${orgId}/scopes`, {
        name: "Проверка курсора",
      }),
      sid = fresh.body.id;
    const snapshot = await effectiveProfile(orgId, sid),
      path = `/organizations/${orgId}/scopes/${sid}/insight-runs`;
    const row = await db.insightRun.create({
      data: {
        orgId,
        scopeId: sid,
        userId: owner.userId,
        kind: "analysis",
        windowFrom: new Date("2026-01-01Z"),
        windowTo: new Date("2026-02-01Z"),
        snapshot: json(snapshot),
        status: "partial",
        coverage: { gaps: ["Исторический архив недоступен"], acceptable: true },
      },
    });
    expect(
      (await db.analysisScope.findUniqueOrThrow({ where: { id: sid } }))
        .cursorAt,
    ).toBeNull();
    expect(
      (
        await post(owner, path + "/" + row.id + "/accept-partial", {
          confirm: false,
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await post(owner, path + "/" + row.id + "/accept-partial", {
          confirm: true,
        })
      ).status,
    ).toBe(200);
    expect(
      await db.auditRecord.count({
        where: { orgId, action: "run.acceptedGaps" },
      }),
    ).toBe(1);
    const at = (
      await db.analysisScope.findUniqueOrThrow({ where: { id: sid } })
    ).cursorAt!;
    const cancelled = await db.insightRun.create({
      data: {
        orgId,
        scopeId: sid,
        userId: owner.userId,
        windowFrom: at,
        windowTo: new Date(),
        snapshot: json(snapshot),
        status: "cancel_requested",
      },
    });
    await db.outbox.create({ data: { id: cancelled.id } });
    expect((await waitJob(owner, cancelled.id)).status).toBe("cancelled");
    expect(
      (await db.analysisScope.findUniqueOrThrow({ where: { id: sid } }))
        .cursorAt,
    ).toEqual(at);
    const rescan = await enqueue({
      orgId,
      scopeId: sid,
      userId: owner.userId,
      kind: "analysis",
      mode: "historical_rescan",
      from: new Date("2026-01-01Z"),
      to: at,
      snapshot,
      key: randomUUID(),
      payload: { rescan: true },
    });
    expect((await waitJob(owner, rescan.jobId)).status).toBe("succeeded");
    expect(
      (await db.analysisScope.findUniqueOrThrow({ where: { id: sid } }))
        .cursorAt,
    ).toEqual(at);
    const to = new Date(at.getTime() + 86400000),
      empty = await enqueue({
        orgId,
        scopeId: sid,
        userId: owner.userId,
        kind: "analysis",
        from: at,
        to,
        snapshot: {
          ...snapshot,
          fields: {
            description: "Нерелевантный проект без отраслевых совпадений",
          },
        },
        key: randomUUID(),
        payload: { empty: true },
      });
    expect((await waitJob(owner, empty.jobId)).status).toBe("succeeded");
    expect(
      await db.insightRevision.count({ where: { runId: empty.jobId } }),
    ).toBe(0);
    expect(
      (await db.analysisScope.findUniqueOrThrow({ where: { id: sid } }))
        .cursorAt,
    ).toEqual(to);
  }, 60000);
  it("restart возобновляет checkpoint и outbox; повтор delivery и SSE не дублирует результат", async () => {
    const u = new URL(config.REDIS_URL),
      queue = new Queue(
        "context-demo-" +
          digest(new URL(config.DATABASE_URL).pathname).slice(0, 12),
        { connection: { host: u.hostname, port: Number(u.port) } },
      );
    await queue.pause();
    try {
      const scope = (
        await post(owner, `/organizations/${orgId}/scopes`, {
          name: "Recovery",
        })
      ).body.id;
      const accepted = await enqueue({
        orgId,
        scopeId: scope,
        userId: owner.userId,
        kind: "analysis",
        from: new Date("2026-09-23T09:00:00Z"),
        to: new Date("2026-10-23T09:00:00Z"),
        snapshot: await effectiveProfile(orgId, scope),
        key: randomUUID(),
        payload: { restart: true },
      });
      await db.insightRun.update({
        where: { id: accepted.jobId },
        data: { status: "running" },
      });
      await analysisGraph(accepted.jobId);
      expect(
        await db.insightRevision.count({ where: { runId: accepted.jobId } }),
      ).toBe(0);
      process.kill(Number(process.env.TEST_WORKER_PID), "SIGTERM");
      replacement = spawn(
        process.execPath,
        ["--import", "tsx", "apps/worker/src/index.ts"],
        { env: process.env, stdio: "inherit" },
      );
      await queue.resume();
      expect((await waitJob(owner, accepted.jobId)).status).toBe("succeeded");
      const before = await db.insightRevision.count({
        where: { runId: accepted.jobId },
      });
      expect(before).toBeGreaterThan(0);
      const prior = await queue.getJob(accepted.jobId);
      if (prior) await prior.remove();
      await queue.add("run", {}, { jobId: accepted.jobId });
      await new Promise((r) => setTimeout(r, 1000));
      expect(
        await db.insightRevision.count({ where: { runId: accepted.jobId } }),
      ).toBe(before);
      const response = await owner.agent.get(
        "/api/v1/jobs/" + accepted.jobId + "/events",
      );
      expect(response.status).toBe(200);
      expect(response.text).toContain("event: completed");
      const last = [...response.text.matchAll(/id: (\d+)/g)].at(-1)![1];
      const replay = await owner.agent
        .get("/api/v1/jobs/" + accepted.jobId + "/events")
        .set("Last-Event-ID", last);
      expect(replay.text).toContain("event: snapshot");
      expect(replay.text).not.toContain("event: completed");
      expect(
        (await reader.agent.get("/api/v1/jobs/" + accepted.jobId + "/events"))
          .status,
      ).toBe(404);
      const loadEvents = await db.runEvent.findMany({
        where: { runId: accepted.jobId, type: "progress" },
      });
      expect(
        loadEvents.filter(
          (e) =>
            (e.data as any).node === "load_context" &&
            !(e.data as any).durationMs,
        ).length,
      ).toBe(1);
    } finally {
      await queue.resume();
      await queue.close();
    }
  }, 60000);

  it("изменение контекста создаёт revision, перепечатки объединены, конфликт отмечен", async () => {
    const existing = await db.insight.findMany({ where: { scopeId } });
    expect(existing.filter((i) => i.eventKey === "automation")).toHaveLength(1);
    expect(existing.find((i) => i.eventKey === "platform")?.lifecycle).toBe(
      "disputed",
    );
    const previous = await effectiveProfile(orgId, scopeId);
    const current = (
      await owner.agent.get(
        `/api/v1/organizations/${orgId}/scopes/${scopeId}/profile`,
      )
    ).body.current;
    await patch(owner, `/organizations/${orgId}/scopes/${scopeId}/profile`, {
      expectedVersion: current.version,
      fields: {
        goal: { value: "Проверить новый сегмент", assertion: "hypothesis" },
      },
    });
    const snapshot = await effectiveProfile(orgId, scopeId);
    expect(snapshot.profileVersionId).not.toBe(previous.profileVersionId);
    const run = await enqueue({
      orgId,
      scopeId,
      userId: owner.userId,
      kind: "analysis",
      mode: "historical_rescan",
      from: new Date("2026-09-23T09:00:00Z"),
      to: new Date("2026-10-23T09:00:00Z"),
      snapshot,
      key: randomUUID(),
      payload: { revision: true },
    });
    expect((await waitJob(owner, run.jobId)).status).toBe("succeeded");
    const revisions = await db.insightRevision.findMany({
      where: {
        insightId: existing.find((i) => i.eventKey === "automation")!.id,
      },
      orderBy: { createdAt: "desc" },
    });
    expect(revisions.length).toBeGreaterThan(1);
    expect((revisions[0].data as any).previousRevisionId).toBeTruthy();
    const source = (revisions[0].evidence as any[]).find(
      (e) => e.kind === "external",
    );
    expect(
      (
        await stranger.agent.get(
          `/api/v1/organizations/${orgId}/evidence/${source.sourceId}`,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await reader.agent.get(
          `/api/v1/organizations/${orgId}/insights/${existing[0].id}`,
        )
      ).status,
    ).toBe(200);
  }, 40000);
  it("reset завершает сессии и токен нельзя использовать повторно", async () => {
    const raw = token();
    await db.authToken.create({
      data: {
        id: hash(raw),
        userId: stranger.userId,
        kind: "reset",
        expiresAt: new Date(Date.now() + 1800000),
      },
    });
    expect(
      (
        await post(owner, "/auth/reset-password", {
          token: raw,
          password: "Changed-password-2026!",
        })
      ).status,
    ).toBe(200);
    expect((await stranger.agent.get("/api/v1/auth/me")).status).toBe(401);
    expect(
      (
        await post(owner, "/auth/reset-password", {
          token: raw,
          password: "Changed-password-2026!",
        })
      ).status,
    ).toBe(400);
  });
});
