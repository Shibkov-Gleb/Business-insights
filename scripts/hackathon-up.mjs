import fs from "node:fs/promises";
import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { createWriteStream, createReadStream } from "node:fs";
/* global fetch, AbortSignal */
const run = (args) =>
  new Promise((resolve, reject) => {
    const p = spawn("docker", args, { stdio: "inherit" });
    p.on("error", reject);
    p.on("exit", (c) =>
      c === 0 ? resolve() : reject(new Error("Docker failed: " + c)),
    );
  });
try {
  await fs.access(".env");
} catch {
  let template = await fs.readFile(".env.hackathon.example", "utf8");
  template = template.replace(
    "replace-with-random-at-least-32-characters",
    randomBytes(36).toString("hex"),
  );
  await fs.writeFile(".env", template, { flag: "wx" });
}
const env = await fs.readFile(".env", "utf8");
if (!/^APP_VARIANT=alfa\s*$/m.test(env))
  throw new Error("Запуск остановлен: .env не принадлежит хакатонной копии");
const manifest = JSON.parse(
  await fs.readFile("data/hackathon/sources.manifest.json", "utf8"),
);
const execute = promisify(execFile);
await fs.mkdir(".hackathon/raw", { recursive: true });
for (const s of manifest.sources) {
  if (
    path.basename(s.filename) !== s.filename ||
    /[\\/]/.test(s.filename) ||
    !/^[A-Za-z0-9_-]+$/.test(s.driveId)
  )
    throw new Error("Некорректный manifest источников");
  const filename = ".hackathon/raw/" + s.filename;
  try {
    await fs.access(filename);
  } catch {
    console.log("Загрузка материала кейса: " + s.filename);
    const url = `https://drive.google.com/uc?export=download&confirm=t&id=${s.driveId}`;
    if (process.platform === "win32") {
      // Windows' system proxy works in networks where Node's direct fetch cannot connect.
      const quote = (value) => "'" + value.replaceAll("'", "''") + "'";
      await execute(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          `$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -Uri ${quote(url)} -OutFile ${quote(path.resolve(filename))} -TimeoutSec 180 -ErrorAction Stop`,
        ],
        { windowsHide: true, timeout: 190000, maxBuffer: 1024 * 1024 },
      );
    } else {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(180000),
      });
      if (
        !response.ok ||
        response.headers.get("content-type")?.includes("text/html") ||
        !response.body
      )
        throw new Error(
          `Не удалось скачать ${s.filename}. Скопируйте оригинал из папки кейса в .hackathon/raw и повторите команду.`,
        );
      await pipeline(response.body, createWriteStream(filename));
    }
  }
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  if (hash.digest("hex") !== s.sha256)
    throw new Error(`Не совпала контрольная сумма: ${s.filename}`);
}
await run(["compose", "-f", "compose.hackathon.yaml", "up", "-d", "--build"]);
console.log(
  "Альфа-Бизнес · http://localhost:3010 · CSV и OCR импортируются до старта API. Платные исследования автоматически не запускаются.",
);
