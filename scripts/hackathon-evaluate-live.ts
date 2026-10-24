import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { z } from "zod";
import { config, hackReadiness } from "@context/config";
import { db, json } from "@context/db";
import {
  companyContextSchema,
  corporateAssessment,
  corporateEvidence,
  workRoles,
} from "@context/contracts";
import { enqueue } from "../packages/db/src/jobs.ts";
import {
  verifyCorporateAssessment,
  personalScore,
  eventFingerprint,
} from "../packages/agent/src/corporate-rules.ts";
import { normalizeQuote } from "../packages/agent/src/bank-corpus.ts";
import { rubString } from "../packages/agent/src/hackathon-budget.ts";
if (
  !process.argv.includes("--confirmed-paid-evaluation") ||
  config.APP_VARIANT !== "alfa" ||
  config.APP_MODE !== "live" ||
  !hackReadiness().ready
)
  throw new Error(
    "LIVE_EVALUATION_BLOCKED: нужен разрешённый шлюз, тариф и явный --confirmed-paid-evaluation",
  );
const caseSchema = z.object({
  id: z.string(),
  split: z.string(),
  profile: z.string(),
  context: companyContextSchema,
  event: z.object({ title: z.string(), text: z.string() }),
  role: z.enum(workRoles),
  relevant: z.boolean(),
});
const cases = z
  .array(caseSchema)
  .parse(
    JSON.parse(await fs.readFile("data/hackathon/evaluation.json", "utf8")),
  )
  .filter((c) => c.split === "heldout");
const batch = randomUUID(),
  user = await db.user.findUniqueOrThrow({
    where: { email: "founder@example.test" },
  });
const org = await db.organization.create({
  data: {
    name: `Live eval ${batch.slice(0, 8)} · синтетические данные`,
    stage: "established",
    description:
      "Платный контрольный прогон на авторском отложенном наборе. Не реальные клиенты банка.",
  },
});
await db.membership.create({
  data: { orgId: org.id, userId: user.id, role: "owner" },
});
const companies = new Map<
  string,
  { id: string; scopeId: string; context: z.infer<typeof companyContextSchema> }
>();
const results: {
  id: string;
  profile: string;
  relevant: boolean;
  score: number;
  fingerprint: string;
  validReferences: boolean;
  falseBankAttribution: boolean;
  runId: string;
  status: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  costRub: string;
  unknownReservationRub: string;
  models: string[];
}[] = [];
let stopped: string | null = null;
try {
  for (const c of cases) {
    if (!companies.has(c.profile)) {
      const scope = await db.analysisScope.create({
        data: { orgId: org.id, name: c.profile },
      });
      const company = await db.corporateCompany.create({
        data: {
          externalId: `eval-${batch}-${c.profile}`,
          name: `Eval ${c.profile} · синтетический`,
          orgId: org.id,
          scopeId: scope.id,
          synthetic: true,
          fields: json(
            Object.fromEntries(c.context.facts.map((f) => [f.key, f.value])),
          ),
        },
      });
      await db.companyGrant.create({
        data: {
          userId: user.id,
          companyId: company.id,
          canEdit: true,
          role: c.role,
        },
      });
      const context = {
        ...c.context,
        id: company.id,
        externalId: company.externalId,
        facts: c.context.facts.map((f) => ({
          ...f,
          evidence: { ...f.evidence, sourceId: company.id },
        })),
      };
      companies.set(c.profile, { id: company.id, scopeId: scope.id, context });
    }
    const company = companies.get(c.profile)!;
    const news = await db.corporateNews.upsert({
      where: {
        companyId_sha256: {
          companyId: company.id,
          sha256: eventFingerprint(c.event.text),
        },
      },
      create: {
        companyId: company.id,
        title: c.event.title,
        text: c.event.text,
        sha256: eventFingerprint(c.event.text),
        origin: "live_eval_fixture",
        synthetic: true,
        createdBy: user.id,
      },
      update: {},
    });
    const input = {
        expectedVersion: 1,
        newsIds: [news.id],
        search: false,
        perspective: c.role,
      },
      start = performance.now();
    const accepted = await enqueue({
      orgId: org.id,
      scopeId: company.scopeId,
      userId: user.id,
      kind: "corporate",
      resourceId: company.id,
      from: new Date(Date.now() - 86400000),
      to: new Date(),
      key: randomUUID(),
      snapshot: { context: company.context, input, requestId: batch },
      payload: input,
    });
    let run = await db.insightRun.findUniqueOrThrow({
      where: { id: accepted.jobId },
    });
    while (
      ["queued", "running", "cancel_requested"].includes(run.status) &&
      performance.now() - start < config.RUN_MAX_MS + 60000
    ) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      run = await db.insightRun.findUniqueOrThrow({ where: { id: run.id } });
    }
    const insight = await db.corporateInsight.findFirst({
      where: { companyId: company.id, newsId: news.id, contextVersion: 1 },
    });
    let validReferences = true,
      falseBankAttribution = false,
      score = 0;
    if (insight) {
      const data = corporateAssessment.parse(insight.data),
        evidence = z.array(corporateEvidence).parse(insight.evidence);
      validReferences =
        verifyCorporateAssessment(data, company.context, evidence, news.text)
          .length === 0;
      for (const e of evidence.filter((e) =>
        data.bankView?.evidenceIds.includes(e.id),
      )) {
        const page = e.page
          ? await db.bankPage.findUnique({
              where: {
                materialId_page: { materialId: e.sourceId, page: e.page },
              },
            })
          : null;
        if (
          !page ||
          !normalizeQuote(page.text).includes(normalizeQuote(e.quote))
        ) {
          validReferences = false;
          falseBankAttribution = true;
        }
        if (e.kind !== "bank" || e.historical || e.confidence !== "verified")
          falseBankAttribution = true;
      }
      score = personalScore(data, c.role, []);
    }
    const reservations = await db.budgetReservation.findMany({
      where: { runId: run.id },
    });
    results.push({
      id: c.id,
      profile: c.profile,
      relevant: c.relevant,
      score,
      fingerprint: eventFingerprint(c.event.text),
      validReferences,
      falseBankAttribution,
      runId: run.id,
      status: run.status,
      latencyMs: performance.now() - start,
      inputTokens: reservations.reduce((n, r) => n + (r.inputTokens || 0), 0),
      outputTokens: reservations.reduce((n, r) => n + (r.outputTokens || 0), 0),
      costRub: rubString(
        reservations.reduce((n, r) => n + (r.actual || 0n), 0n),
      ),
      unknownReservationRub: rubString(
        reservations
          .filter((r) => ["unknown", "reserved"].includes(r.status))
          .reduce((n, r) => n + r.estimated, 0n),
      ),
      models: [...new Set(reservations.map((r) => r.model))],
    });
    console.log(
      JSON.stringify({ caseId: c.id, runId: run.id, status: run.status }),
    );
    if (["failed", "cancelled"].includes(run.status)) {
      stopped = run.error || run.status;
      break;
    }
    if (["queued", "running", "cancel_requested"].includes(run.status)) {
      await db.insightRun.update({
        where: { id: run.id },
        data: { status: "cancel_requested" },
      });
      stopped = "EVALUATION_TIMEOUT";
      break;
    }
  }
} catch (error) {
  stopped =
    error instanceof Error && /^[A-Z_]+$/.test(error.message)
      ? error.message
      : "EVALUATION_ERROR";
} finally {
  const precisions = [...new Set(results.map((r) => r.profile))].map(
    (profile) => {
      const seen = new Set<string>();
      const top = results
        .filter((r) => r.profile === profile && r.score > 0)
        .sort((a, b) => b.score - a.score)
        .filter((r) => {
          if (seen.has(r.fingerprint)) return false;
          seen.add(r.fingerprint);
          return true;
        })
        .slice(0, 5);
      return top.filter((r) => r.relevant).length / 5;
    },
  );
  const report = {
    batch,
    generatedAt: new Date().toISOString(),
    mode: "live-organizer-gateway",
    labels: "Авторские, не экспертные",
    completed: results.length,
    expected: cases.length,
    stopped,
    precisionAt5: precisions.length
      ? precisions.reduce((a, b) => a + b, 0) / precisions.length
      : null,
    validReferences: results.length
      ? results.filter((r) => r.validReferences).length / results.length
      : null,
    falseBankAttributions: results.filter((r) => r.falseBankAttribution).length,
    semanticExpertReview: "pending",
    finalReleaseAuthorized: false,
    results,
  };
  await fs.mkdir(".hackathon/reports", { recursive: true });
  await fs.writeFile(
    `.hackathon/reports/live-${batch}.json`,
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      completed: report.completed,
      expected: report.expected,
      stopped,
      precisionAt5: report.precisionAt5,
      finalReleaseAuthorized: false,
    }),
  );
  await db.$disconnect();
  if (stopped || results.length !== cases.length) process.exitCode = 1;
}
