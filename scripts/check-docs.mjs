import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd(),
  errors = [];
async function filesIn(dir) {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await filesIn(file)));
    else if (entry.name.endsWith(".md")) out.push(file);
  }
  return out;
}
const files = [
  ...["README.md", "CONTRIBUTING.md", "THIRD_PARTY_NOTICES.md"].map((f) =>
    path.join(root, f),
  ),
  ...(await filesIn(path.join(root, "docs"))),
  ...(await filesIn(path.join(root, ".github"))),
];
const slug = (text) =>
  text
    .toLowerCase()
    .replace(/<[^>]*>/g, "")
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .trim()
    .replace(/\s/g, "-");
function anchors(text) {
  const set = new Set(),
    counts = new Map();
  for (const match of text.matchAll(/^#{1,6}\s+(.+)$/gm)) {
    const base = slug(match[1].replace(/\s+#+\s*$/, ""));
    const count = counts.get(base) || 0;
    set.add(count ? base + "-" + count : base);
    counts.set(base, count + 1);
  }
  for (const match of text.matchAll(/\bid=["']([^"']+)["']/g))
    set.add(match[1]);
  return set;
}
let checked = 0;
for (const file of files) {
  const text = (await fs.readFile(file, "utf8"))
    .replace(/\r\n/g, "\n")
    .replace(/^`{3}[^\n]*\n[\s\S]*?^`{3}[^\n]*$/gm, "");
  const refs = [
    ...text.matchAll(
      /!?\[[^\]\n]*\]\((?:<([^>]+)>|([^\s)]+))(?:\s+["'][^"']*["'])?\)/g,
    ),
  ].map((m) => m[1] || m[2]);
  for (const m of text.matchAll(
    /<(?:img|a)\b[^>]*\b(?:src|href)=["']([^"']+)["']/g,
  ))
    refs.push(m[1]);
  for (const ref of refs) {
    if (/^(?:[a-z][\w+.-]*:|\/\/)/i.test(ref)) continue;
    checked++;
    const [raw, fragment] = ref.split("#");
    const target = raw
      ? path.resolve(path.dirname(file), decodeURIComponent(raw.split("?")[0]))
      : file;
    const label = path.relative(root, file) + ": " + ref;
    if (target !== root && !target.startsWith(root + path.sep)) {
      errors.push("Outside repository: " + label);
      continue;
    }
    try {
      const stat = await fs.stat(target);
      if (fragment && stat.isFile() && target.endsWith(".md")) {
        const available = anchors(
          (await fs.readFile(target, "utf8")).replace(/\r\n/g, "\n"),
        );
        if (!available.has(decodeURIComponent(fragment)))
          errors.push("Missing anchor: " + label);
      }
    } catch {
      errors.push("Missing file: " + label);
    }
  }
}
const catalog = JSON.parse(
  await fs.readFile("docs/hackathon-requirements.json", "utf8"),
);
const ids = new Set(catalog.requirements.map((r) => r.id));
if (ids.size !== catalog.requirements.length)
  errors.push("Duplicate requirement ID");
for (let i = 1; i <= 12; i++)
  if (!ids.has("S" + String(i).padStart(2, "0")))
    errors.push("Missing success criterion " + i);
for (const requirement of catalog.requirements)
  if (requirement.page < 1 || requirement.page > catalog.source.pages)
    errors.push("Invalid source page: " + requirement.id);
const matrix = await fs.readFile("docs/hackathon-compliance.md", "utf8");
const covered = new Set(matrix.match(/\b[A-Z]\d{2}\b/g) || []);
for (const m of matrix.matchAll(/\b([A-Z])(\d{2})[–-](?:\1)?(\d{2})\b/g)) {
  for (let i = Number(m[2]); i <= Number(m[3]); i++)
    covered.add(m[1] + String(i).padStart(2, "0"));
}
for (const id of ids)
  if (!covered.has(id)) errors.push("Requirement absent from matrix: " + id);
const manifest = JSON.parse(
  await fs.readFile("data/hackathon/sources.manifest.json", "utf8"),
);
if (
  manifest.sources.length !== 12 ||
  manifest.sources.filter((s) => s.kind === "bank").length !== 9
)
  errors.push("Unexpected source manifest counts");
const cases = JSON.parse(
  await fs.readFile("data/hackathon/evaluation.json", "utf8"),
);
if (
  cases.filter((c) => c.split === "development").length < 40 ||
  cases.filter((c) => c.split === "heldout").length < 20
)
  errors.push("Evaluation split does not meet 40/20");
for (const report of [
  "docs/hackathon-live-evaluation.json",
  "docs/hackathon-live-v2-regression.json",
  "docs/hackathon-live-smoke.json",
  "docs/hackathon-live-persistence.json",
  "docs/openapi.alfa.json",
])
  JSON.parse(await fs.readFile(report, "utf8"));
for (const asset of [
  "docs/assets/hackathon-cover.svg",
  "docs/assets/insight-desktop.png",
  "docs/assets/insight-mobile.png",
])
  await fs.access(asset);
if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else
  console.log(
    "Documentation OK: " +
      files.length +
      " Markdown files, " +
      checked +
      " local references, " +
      ids.size +
      " source requirements, 12 source files and 60+ evaluation cases.",
  );
