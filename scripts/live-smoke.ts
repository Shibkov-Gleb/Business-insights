import { config } from "@context/config";
import { HttpLLM, newBudget } from "../packages/agent/src/providers.ts";
import { BraveSearch } from "../packages/agent/src/sources.ts";
import { z } from "zod";
if (
  !config.LLM_API_KEY ||
  !config.LLM_MODEL_ID ||
  !config.BRAVE_SEARCH_API_KEY
) {
  console.log(
    "SKIP: live LLM/search configuration is incomplete. No external paid calls made.",
  );
} else {
  const budget = newBudget({ llm: 2, tokens: 6000 });
  const answer = await new HttpLLM().structured(
    z.object({ ok: z.boolean() }),
    "Верни ok=true для проверки контракта.",
    {},
    budget,
  );
  if (!answer.ok) throw new Error("LLM_SMOKE_ASSERTION_FAILED");
  const to = new Date().toISOString(),
    from = new Date(Date.now() - 86400000).toISOString();
  const results = await new BraveSearch().search(
    "business technology news",
    from,
    to,
  );
  console.log(
    JSON.stringify({
      llm: "passed",
      search: "passed",
      results: results.length,
      inputTokens: budget.inputTokens,
      outputTokens: budget.outputTokens,
    }),
  );
}
