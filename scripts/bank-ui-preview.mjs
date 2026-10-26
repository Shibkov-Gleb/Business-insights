import { spawn } from "node:child_process";
import path from "node:path";
const root = process.cwd();
const api = spawn(
  process.execPath,
  ["node_modules/tsx/dist/cli.mjs", "scripts/bank-ui-fixture-server.ts"],
  { cwd: root, stdio: "inherit", windowsHide: true },
);
const web = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "dev",
    "--port",
    "3012",
    "--hostname",
    "127.0.0.1",
  ],
  {
    cwd: path.join(root, "apps/web"),
    stdio: "inherit",
    windowsHide: true,
    env: {
      ...process.env,
      APP_VARIANT: "alfa",
      BANK_UI_PREVIEW: "1",
      INTERNAL_API_URL: "http://127.0.0.1:4012",
    },
  },
);
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  api.kill();
  web.kill();
  process.exitCode = code;
}
api.on("error", (e) => {
  console.error(e.message);
  stop(1);
});
web.on("error", (e) => {
  console.error(e.message);
  stop(1);
});
api.on("exit", (code) => stop(code ?? 1));
web.on("exit", (code) => stop(code ?? 1));
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
console.log(
  "UI preview: http://127.0.0.1:3012 · synthetic, read-only, no keys",
);
