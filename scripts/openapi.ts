import fs from "node:fs/promises";
import { config } from "@context/config";
import { openapi } from "../packages/contracts/src/openapi.ts";
await fs.mkdir("docs", { recursive: true });
await fs.writeFile(
  config.APP_VARIANT === "alfa"
    ? "docs/openapi.alfa.json"
    : "docs/openapi.json",
  JSON.stringify(openapi(), null, 2) + "\n",
);
