import "dotenv/config";
import { Client } from "pg";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { URL } from "node:url";
import { setTimeout } from "node:timers";
const name = "context_test_" + randomBytes(6).toString("hex");
const root = new URL(process.env.DATABASE_URL);
root.pathname = "/postgres";
const admin = new Client({ connectionString: root.toString() });
await admin.connect();
const url = new URL(root);
url.pathname = "/" + name;
const env = {
  ...process.env,
  DATABASE_URL: url.toString(),
  APP_MODE: "demo",
  PUBLIC_APP_URL: "http://localhost:3000",
  RUN_MAX_SEARCH: "12",
  RUN_MAX_PAGES: "40",
  RUN_MAX_LLM: "16",
  STORAGE_ROOT: ".cache/" + name,
};
const run = (args) =>
  new Promise((resolve, reject) => {
    const p = spawn(process.execPath, args, { env, stdio: "inherit" });
    p.on("error", reject);
    p.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error("Command failed: " + code)),
    );
  });
let worker;
try {
  await admin.query(`CREATE DATABASE "${name}"`);
  await run(["node_modules/prisma/build/index.js", "migrate", "deploy"]);
  worker = spawn(
    process.execPath,
    ["--import", "tsx", "apps/worker/src/index.ts"],
    { env, stdio: "inherit" },
  );
  env.TEST_WORKER_PID = String(worker.pid);
  await run([
    "node_modules/vitest/vitest.mjs",
    "run",
    "tests/integration/corporate.test.ts",
    "tests/integration/corporate-flow.test.ts",
    "--no-file-parallelism",
  ]);
  // Legacy restart tests own their replacement worker and stop it in afterAll.
  await run(["node_modules/vitest/vitest.mjs", "run", "tests/integration/workflows.test.ts", "--no-file-parallelism"]);
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  if (worker) {
    worker.kill("SIGTERM");
    await new Promise((r) => {
      worker.once("exit", r);
      setTimeout(r, 3000);
    });
  }
  await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await admin.end();
}
