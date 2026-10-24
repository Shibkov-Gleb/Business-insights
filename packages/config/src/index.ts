import "dotenv/config";
import { z } from "zod";
import { hackReadiness } from "./hackathon.ts";
export * from "./hackathon.ts";
const schema = z.object({
  APP_MODE: z.enum(["demo", "live"]).default("demo"),
  APP_VARIANT: z.enum(["personal", "alfa"]).default("personal"),
  PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  STORAGE_ROOT: z.string().default("./storage"),
  SMTP_HOST: z.string().default(""),
  SMTP_PORT: z.coerce.number().default(1025),
  SMTP_FROM: z.string().default("Контекст <context@example.test>"),
  SMTP_USER: z.string().default(""),
  SMTP_PASSWORD: z.string().default(""),
  LLM_BASE_URL: z.url().default("https://api.openai.com/v1"),
  LLM_API_KEY: z.string().default(""),
  LLM_MODEL_ID: z.string().default(""),
  LLM_PROVIDER: z.enum(["auto", "gemini", "openai-compatible"]).default("auto"),
  LLM_REASONING_EFFORT: z
    .enum(["minimal", "low", "medium", "high"])
    .default("low"),
  LLM_CONTEXT_LIMIT: z.coerce.number().positive().default(32000),
  LLM_MAX_OUTPUT_TOKENS: z.coerce
    .number()
    .int()
    .min(256)
    .max(16384)
    .default(2000),
  BRAVE_SEARCH_API_KEY: z.string().default(""),
  RUN_MAX_SEARCH: z.coerce.number().int().positive().default(12),
  RUN_MAX_PAGES: z.coerce.number().int().positive().default(40),
  RUN_MAX_LLM: z.coerce.number().int().positive().default(16),
  RUN_MAX_TOKENS: z.coerce.number().int().positive().default(60000),
  RUN_MAX_MS: z.coerce.number().positive().default(600000),
  CHAT_MAX_LLM: z.coerce.number().positive().default(4),
  CHAT_MAX_SEARCH: z.coerce.number().positive().default(4),
  CHAT_MAX_TOKENS: z.coerce.number().positive().default(15000),
  FILE_MAX_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(25 * 1024 * 1024),
  FILE_MAX_COUNT: z.coerce.number().int().positive().default(50),
  FILE_TOTAL_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(500 * 1024 * 1024),
  TOKEN_PRICE_INPUT: z
    .string()
    .regex(/^$|^\d+(\.\d{1,9})?$/)
    .default(""),
  TOKEN_PRICE_OUTPUT: z
    .string()
    .regex(/^$|^\d+(\.\d{1,9})?$/)
    .default(""),
  RETENTION_DAYS: z.coerce.number().positive().default(30),
});
export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  const result = schema.safeParse(env);
  if (!result.success)
    throw new Error(
      "Некорректная конфигурация: " +
        result.error.issues.map((x) => x.path.join(".")).join(", "),
    );
  const publicUrl = new URL(result.data.PUBLIC_APP_URL);
  if (
    publicUrl.protocol !== "https:" &&
    !["localhost", "127.0.0.1", "[::1]"].includes(publicUrl.hostname)
  )
    throw new Error("PUBLIC_APP_URL требует HTTPS вне localhost");
  return result.data;
}
export const config = readConfig();
export const publicConfig = () => ({
  variant: config.APP_VARIANT,
  mode: config.APP_MODE,
  locale: "ru",
  integration: {
    provider:
      config.LLM_PROVIDER === "auto"
        ? config.LLM_BASE_URL.includes("generativelanguage.googleapis.com")
          ? "gemini"
          : "openai-compatible"
        : config.LLM_PROVIDER,
    model: config.LLM_MODEL_ID || null,
    search: "Brave + RSS",
    limits: {
      search: config.RUN_MAX_SEARCH,
      pages: config.RUN_MAX_PAGES,
      llm: config.RUN_MAX_LLM,
      tokens: config.RUN_MAX_TOKENS,
    },
    costKnown: !!(config.TOKEN_PRICE_INPUT && config.TOKEN_PRICE_OUTPUT),
  },
  ready: {
    analysis: config.APP_VARIANT === "alfa" ? config.APP_MODE === "demo" || hackReadiness().ready :
      config.APP_MODE === "demo" ||
      !!(
        config.LLM_API_KEY &&
        config.LLM_MODEL_ID &&
        config.BRAVE_SEARCH_API_KEY
      ),
    mail: !!config.SMTP_HOST,
  },
  ...(config.APP_VARIANT === "alfa" ? { hackathon: hackReadiness() } : {}),
});
