import fs from "node:fs/promises";
import { openapi } from "../packages/contracts/src/openapi.ts";
await fs.mkdir("docs", { recursive: true });
await fs.writeFile(
  "docs/openapi.json",
  JSON.stringify(openapi(), null, 2) + "\n",
);
