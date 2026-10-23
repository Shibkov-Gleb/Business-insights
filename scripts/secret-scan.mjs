import "dotenv/config";
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
const files = [
  ...new Set(
    execFileSync("git", ["ls-files", "-co", "--exclude-standard", "-z"], {
      encoding: "utf8",
    })
      .split("\0")
      .filter(Boolean),
  ),
];
const values = [
  "SESSION_SECRET",
  "LLM_API_KEY",
  "BRAVE_SEARCH_API_KEY",
  "SMTP_PASSWORD",
]
  .map((k) => process.env[k])
  .filter((v) => v && v.length >= 16 && !v.includes("replace-with"));
const failures = [];
const historyObjects = execFileSync("git", ["rev-list", "--objects", "--all"], {
  encoding: "utf8",
})
  .split("\n")
  .filter(Boolean)
  .map((line) => line.split(" ")[0]);
const historyText = historyObjects.length
  ? execFileSync("git", ["cat-file", "--batch"], {
      input: historyObjects.join("\n") + "\n",
      maxBuffer: 64 * 1024 * 1024,
    }).toString("utf8")
  : "";
if (
  values.some((value) => historyText.includes(value)) ||
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bAKIA[A-Z0-9]{16}\b|\bsk-[A-Za-z0-9_-]{30,}\b/.test(
    historyText,
  )
)
  failures.push("Git history");
for (const file of files) {
  if (!statSync(file).isFile()) continue;
  const body = readFileSync(file, "utf8");
  if (
    values.some((value) => body.includes(value)) ||
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bAKIA[A-Z0-9]{16}\b|\bsk-[A-Za-z0-9_-]{30,}\b/.test(
      body,
    )
  )
    failures.push(file);
  if (/(^|\/)(\.env|storage|\.cache)(\/|$)/.test(file)) failures.push(file);
}
if (failures.length) {
  console.error(
    "Potential secrets/private files:",
    [...new Set(failures)].join(", "),
  );
  process.exitCode = 1;
} else
  console.log(
    `Scanned ${files.length} source/fixture files; no configured secrets or private runtime files found.`,
  );
