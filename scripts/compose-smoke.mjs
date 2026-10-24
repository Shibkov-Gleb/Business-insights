import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
const { fetch, FormData, Blob, setTimeout } = globalThis;
const base = process.env.SMOKE_URL || "http://localhost:3001";
let cookie = "",
  csrf = "";
async function api(path, method = "GET", body) {
  const response = await fetch(base + "/api/v1" + path, {
    method,
    headers: {
      Cookie: cookie,
      Origin: base,
      ...(method !== "GET"
        ? { "X-CSRF-Token": csrf, "Idempotency-Key": randomUUID() }
        : {}),
      ...(body && !(body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
    },
    body:
      body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  const cookies = response.headers.getSetCookie();
  if (cookies.length) cookie = cookies.map((c) => c.split(";")[0]).join("; ");
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      `${method} ${path}: ${response.status} ${result.error?.code}`,
    );
  if (result.csrfToken) csrf = result.csrfToken;
  return result;
}
async function wait(id) {
  for (let i = 0; i < 180; i++) {
    const run = await api("/jobs/" + id);
    if (["succeeded", "failed", "partial", "cancelled"].includes(run.status)) {
      if (run.status !== "succeeded") throw new Error("Job " + run.status);
      return run;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("Job timeout");
}
const checksum = (bytes) => createHash("sha256").update(bytes).digest("hex");
for (let i = 0; i < 90; i++) {
  try {
    const r = await fetch(base + "/api/v1/health/ready");
    if (r.ok) break;
  } catch {
    /* Service may still be restarting. */
  }
  if (i === 89) throw new Error("Server readiness timeout");
  await new Promise((r) => setTimeout(r, 500));
}
await api("/health/ready");
await api("/auth/csrf");
await api("/auth/login", "POST", {
  email: "founder@example.test",
  password: "Context-demo-2026!",
});
if (process.argv[2] === "before") {
  const org = await api("/organizations", "POST", {
    name: "Compose acceptance " + randomUUID().slice(0, 8),
    stage: "idea",
    description: "B2B SaaS автоматизация отчётности для небольших команд",
  });
  const scope = (await api("/organizations/" + org.id + "/scopes")).items[0];
  const path = "/organizations/" + org.id;
  const docs = [];
  for (const [ext, mime] of [
    ["pdf", "application/pdf"],
    [
      "pptx",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ],
    [
      "docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
    ["txt", "text/plain"],
    ["md", "text/markdown"],
  ]) {
    const bytes = await readFile("tests/fixtures/synthetic." + ext),
      form = new FormData();
    form.set("scopeId", scope.id);
    form.set("file", new Blob([bytes], { type: mime }), "synthetic." + ext);
    const doc = await api(path + "/documents", "POST", form);
    await wait(doc.jobId);
    docs.push({ id: doc.documentId, checksum: checksum(bytes) });
  }
  const run = await api(
    path + "/scopes/" + scope.id + "/insight-runs",
    "POST",
    { mode: "normal" },
  );
  await wait(run.jobId);
  const feed = await api(path + "/insights?scopeId=" + scope.id);
  if (!feed.items.length) throw new Error("Empty feed");
  const chat = await api(path + "/chats", "POST", {
    scopeId: scope.id,
    insightId: feed.items[0].id,
    title: "Compose persistence",
  });
  const msg = await api(path + "/chats/" + chat.id + "/messages", "POST", {
    text: "Какие предположения проверить?",
  });
  await wait(msg.jobId);
  const researchPath = path + "/scopes/" + scope.id;
  const competitor = await api(researchPath + "/competitors", "POST", {
    name: "Compose research",
    domain: "compose.example.test",
  });
  const research = await api(researchPath + "/research-runs", "POST", {
    competitorIds: [competitor.id],
  });
  await wait(research.jobId);
  const dossier = await api(
    researchPath + "/competitors/" + competitor.id + "/dossier",
  );
  const sourceId = dossier.snapshots[0].facts[0].sourceSnapshotId;
  const source = await api(researchPath + "/source-snapshots/" + sourceId);
  await api(
    researchPath + "/competitors/" + competitor.id + "/manual-facts",
    "PATCH",
    {
      expectedVersion: dossier.competitor.revision,
      fields: { pricing: "Проверено при приёмке" },
    },
  );
  const overview = await api(researchPath + "/market-overview");
  await api(
    researchPath + "/research-briefs/" + overview.briefs[0].id + "/decision",
    "POST",
    { confirm: true },
  );
  const proof = {
    orgId: org.id,
    scopeId: scope.id,
    docs,
    runId: run.jobId,
    chatId: chat.id,
    insightIds: feed.items.map((i) => i.id),
    researchId: research.jobId,
    competitorId: competitor.id,
    sourceId,
    sourceChecksum: source.checksum,
    briefId: overview.briefs[0].id,
  };
  await mkdir(".cache", { recursive: true });
  await writeFile(".cache/compose-proof.json", JSON.stringify(proof));
  console.log(
    "BEFORE: five document formats, analysis, chat, research, immutable source, manual facts and decision persisted in fresh Compose volumes.",
  );
} else {
  const proof = JSON.parse(await readFile(".cache/compose-proof.json", "utf8")),
    path = "/organizations/" + proof.orgId;
  for (const doc of proof.docs) {
    const response = await fetch(
      base + "/api/v1" + path + "/documents/" + doc.id + "/download",
      { headers: { Cookie: cookie } },
    );
    if (
      !response.ok ||
      checksum(Buffer.from(await response.arrayBuffer())) !== doc.checksum
    )
      throw new Error("Document persistence mismatch");
  }
  const run = await api("/jobs/" + proof.runId);
  if (run.status !== "succeeded") throw new Error("Run lost");
  const feed = await api(path + "/insights?scopeId=" + proof.scopeId);
  if (proof.insightIds.some((id) => !feed.items.some((i) => i.id === id)))
    throw new Error("Insight lost");
  const chat = await api(path + "/chats/" + proof.chatId);
  if (chat.messages.length !== 2 || chat.messages[1].status !== "complete")
    throw new Error("Chat lost");
  const researchPath = path + "/scopes/" + proof.scopeId;
  const source = await api(
    researchPath + "/source-snapshots/" + proof.sourceId,
  );
  if (source.checksum !== proof.sourceChecksum)
    throw new Error("Snapshot changed");
  const dossier = await api(
    researchPath + "/competitors/" + proof.competitorId + "/dossier",
  );
  if (dossier.competitor.data.manualFacts.pricing !== "Проверено при приёмке")
    throw new Error("Manual fact lost");
  const decisions = await api(researchPath + "/research-decisions");
  if (!decisions.items.some((d) => d.briefId === proof.briefId))
    throw new Error("Research decision lost");
  console.log(
    "AFTER: document checksums, insights, chat, immutable source, manual facts and research decision survived restart.",
  );
}
