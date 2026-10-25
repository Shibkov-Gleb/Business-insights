import { z } from "zod";
export const allowedFamilies = [
  "gemma-4-26b-a4b",
  "glm-5.3-flash",
  "qwen3.6-35b-a3b",
  "deepseek-v4.1-flash",
  "qwen3-vl-30b-a3b-instruct",
  "kimi-k2.6",
] as const;
export const hackConfig = z
  .object({
    HACKATHON_LLM_BASE_URL: z.string().default(""),
    HACKATHON_LLM_API_KEY: z.string().default(""),
    HACKATHON_EXTRACT_MODEL: z.string().default(""),
    HACKATHON_REASON_MODEL: z.string().default(""),
    HACKATHON_MODEL_REGISTRY: z.string().default("{}"),
    HACKATHON_MODEL_PRICES: z.string().default("{}"),
    HACKATHON_BUDGET_RUB: z.coerce.number().positive().max(500).default(500),
    HACKATHON_BUDGET_TIMEZONE: z.string().default("Europe/Moscow"),
    HACKATHON_BUDGET_RESET_HOUR: z.coerce
      .number()
      .int()
      .min(0)
      .max(23)
      .default(3),
    HACKATHON_OUTPUT_TOKENS: z.coerce
      .number()
      .int()
      .min(256)
      .max(8192)
      .default(2048),
    HACKATHON_DATA_ROOT: z.string().default(".hackathon"),
    HACKATHON_FILE_MAX_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .max(104857600)
      .default(104857600),
    HACKATHON_BANK_MAX_PAGES: z.coerce
      .number()
      .int()
      .positive()
      .max(500)
      .default(200),
    HACKATHON_OCR_CONCURRENCY: z.coerce.number().int().min(1).max(4).default(2),
  })
  .parse(process.env);
const price = z.object({
  inputRubPerMillion: z.string().regex(/^\d+(\.\d{1,9})?$/),
  outputRubPerMillion: z.string().regex(/^\d+(\.\d{1,9})?$/),
});
export function hackModel(task: "extract" | "reason") {
  const model =
    task === "extract"
      ? hackConfig.HACKATHON_EXTRACT_MODEL
      : hackConfig.HACKATHON_REASON_MODEL;
  let registry: Record<string, (typeof allowedFamilies)[number]>;
  try {
    registry = z
      .record(z.string(), z.enum(allowedFamilies))
      .parse(JSON.parse(hackConfig.HACKATHON_MODEL_REGISTRY));
  } catch {
    throw new Error("HACKATHON_MODEL_REGISTRY_INVALID");
  }
  if (!model || !registry[model] || /gemini|gpt-|claude/i.test(model))
    throw new Error("HACKATHON_MODEL_FORBIDDEN");
  const endpoint = new URL(hackConfig.HACKATHON_LLM_BASE_URL);
  if (
    endpoint.protocol !== "https:" &&
    !["localhost", "127.0.0.1"].includes(endpoint.hostname)
  )
    throw new Error("HACKATHON_ENDPOINT_INVALID");
  if (!hackConfig.HACKATHON_LLM_API_KEY) throw new Error("HACKATHON_NOT_READY");
  let prices: Record<string, z.infer<typeof price>>;
  try {
    prices = z
      .record(z.string(), price)
      .parse(JSON.parse(hackConfig.HACKATHON_MODEL_PRICES));
  } catch {
    throw new Error("HACKATHON_PRICING_UNKNOWN");
  }
  if (!prices[model]) throw new Error("HACKATHON_PRICING_UNKNOWN");
  return {
    model,
    family: registry[model],
    endpoint: endpoint.toString().replace(/\/$/, ""),
    price: prices[model],
  };
}
export function hackReadiness() {
  try {
    const extract = hackModel("extract"),
      reason = hackModel("reason");
    return {
      ready: true,
      extract: extract.model,
      reason: reason.model,
      error: null,
    };
  } catch (error) {
    return {
      ready: false,
      extract: hackConfig.HACKATHON_EXTRACT_MODEL || null,
      reason: hackConfig.HACKATHON_REASON_MODEL || null,
      error: error instanceof Error ? error.message : "HACKATHON_NOT_READY",
    };
  }
}
