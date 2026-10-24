import fs from "node:fs/promises";
import { openapi } from "../packages/contracts/src/openapi.ts";
await fs.writeFile("docs/openapi.alfa.json", JSON.stringify(openapi(), null, 2) + "\n");
console.log("OpenAPI exported");
