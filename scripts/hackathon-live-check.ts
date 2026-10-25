import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { db } from "@context/db";
import { config, hackReadiness } from "@context/config";
import { companyContext } from "../packages/db/src/corporate-context.ts";
import { enqueue } from "../packages/db/src/jobs.ts";
import { readRss, extractPage, digest } from "../packages/agent/src/sources.ts";
if (
  !process.argv.includes("--confirmed-paid-check") ||
  config.APP_MODE !== "live" ||
  !hackReadiness().ready
)
  throw new Error("LIVE_CHECK_NOT_AUTHORIZED");
const batch = randomUUID();
let runId: string | undefined;
async function waitForRun(id: string) {
  const until = Date.now() + config.RUN_MAX_MS + 30000;
  while (Date.now() < until) {
    const run = await db.insightRun.findUniqueOrThrow({ where: { id } });
    if (!["queued", "running", "cancel_requested"].includes(run.status)) {
      if (!["succeeded", "partial"].includes(run.status))
        throw new Error(run.error || "LIVE_CHECK_FAILED");
      return run;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  await db.insightRun.updateMany({
    where: { id, status: { in: ["queued", "running"] } },
    data: { status: "cancel_requested" },
  });
  throw new Error("LIVE_CHECK_TIMEOUT");
}
try {
  const user = await db.user.findUniqueOrThrow({
    where: { email: "founder@example.test" },
  });
  const company = await db.corporateCompany.findUniqueOrThrow({
    where: { externalId: "synthetic-metal" },
  });
  const context = await companyContext(company.id, user.id);
  const hit = (await readRss("https://www.cbr.ru/rss/RssPress")).find(
    (x) =>
      x.publishedAt &&
      new Date(x.publishedAt).getTime() > Date.now() - 30 * 86400000 &&
      new Date(x.publishedAt).getTime() <= Date.now(),
  );
  if (!hit) throw new Error("LIVE_RSS_NEWS_UNAVAILABLE");
  const page = await extractPage(hit);
  if (page.text.length < 100) throw new Error("LIVE_SOURCE_UNAVAILABLE");
  const news = await db.corporateNews.upsert({
    where: {
      companyId_sha256: { companyId: company.id, sha256: digest(page.text) },
    },
    create: {
      companyId: company.id,
      title: page.title,
      text: page.text,
      url: page.url,
      publishedAt: new Date(hit.publishedAt!),
      sha256: digest(page.text),
      origin: "live_rss_check",
      createdBy: user.id,
      synthetic: false,
    },
    update: {},
  });
  console.log(
    JSON.stringify({
      stage: "real_news",
      url: news.url,
      title: news.title,
      publishedAt: news.publishedAt,
    }),
  );
  const input = {
    expectedVersion: company.version,
    newsIds: [news.id],
    search: false,
    perspective: "cfo",
  };
  const accepted = await enqueue({
    orgId: company.orgId!,
    scopeId: company.scopeId!,
    userId: user.id,
    resourceId: company.id,
    kind: "corporate",
    from: new Date(Date.now() - 30 * 86400000),
    to: new Date(),
    key: batch,
    payload: input,
    snapshot: { context, input, requestId: batch },
  });
  runId = accepted.jobId;
  const state = await waitForRun(runId);
  const insight = await db.corporateInsight.findFirst({
    where: {
      companyId: company.id,
      newsId: news.id,
      contextVersion: company.version,
    },
  });
  if (!insight) {
    console.log(
      JSON.stringify({
        stage: "unpublished",
        status: state.status,
        coverage: state.coverage,
      }),
    );
    throw new Error("LIVE_INSIGHT_NOT_PUBLISHED");
  }
  const chat = await db.corporateChat.create({
    data: {
      companyId: company.id,
      userId: user.id,
      insightId: insight.id,
      role: "cfo",
      question:
        "Какие данные финансовому директору нужно уточнить перед решением по этой новости?",
    },
  });
  const chatAccepted = await enqueue({
    orgId: company.orgId!,
    scopeId: company.scopeId!,
    userId: user.id,
    resourceId: chat.id,
    kind: "corporate_chat",
    from: new Date(),
    to: new Date(),
    key: batch + "-chat",
    payload: { question: chat.question },
    snapshot: { companyId: company.id, role: "cfo", requestId: batch },
  });
  await db.corporateChat.update({
    where: { id: chat.id },
    data: { runId: chatAccepted.jobId },
  });
  await waitForRun(chatAccepted.jobId);
  const answer = await db.corporateChat.findUniqueOrThrow({
    where: { id: chat.id },
  });
  const report = {
    batch,
    at: new Date().toISOString(),
    status: state.status,
    news: { url: news.url, title: news.title, publishedAt: news.publishedAt },
    companySynthetic: true,
    runId,
    chatRunId: chatAccepted.jobId,
    insightId: insight.id,
    assessment: insight.data,
    evidence: insight.evidence,
    chat: { answer: answer.answer, evidence: answer.evidence },
    costRub: null,
  };
  await fs.mkdir(".hackathon/reports", { recursive: true });
  await fs.writeFile(
    `.hackathon/reports/live-check-${batch}.json`,
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify({
      status: state.status,
      runId,
      insightId: insight.id,
      chatAnswered: !!answer.answer,
      url: `http://localhost:3010/bank/${company.id}/insights/${insight.id}?role=cfo`,
    }),
  );
} catch (e) {
  if (runId)
    await db.insightRun.updateMany({
      where: { id: runId, status: { in: ["testing", "running"] } },
      data: {
        status: "failed",
        finishedAt: new Date(),
        error:
          e instanceof Error && /^[A-Z_]+$/.test(e.message)
            ? e.message
            : "LIVE_CHECK_FAILED",
      },
    });
  throw e;
} finally {
  await db.$disconnect();
}
