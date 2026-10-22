import { z } from "zod";

const emptyToUndefined = (v: unknown) => (v === "" ? undefined : v);

export const llmConfigSchema = z
  .object({
    LLM_ENABLED: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
    LLM_BASE_URL: z.preprocess(emptyToUndefined, z.url().optional()),
    LLM_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
    /** Optional custom auth header, format "Header-Name: value". */
    LLM_AUTH_HEADER: z.preprocess(emptyToUndefined, z.string().optional()),
    LLM_MODEL_DEFAULT: z.preprocess(emptyToUndefined, z.string().optional()),
    LLM_MODEL_SMALL: z.preprocess(emptyToUndefined, z.string().optional()),
    LLM_MODEL_EMBED: z.preprocess(emptyToUndefined, z.string().optional()),
    LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
    LLM_MAX_INPUT_TOKENS: z.coerce.number().int().positive().default(8_000),
    LLM_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().default(1_500),
  })
  .refine((c) => !c.LLM_ENABLED || (c.LLM_BASE_URL && c.LLM_MODEL_DEFAULT), {
    message: "LLM_BASE_URL and LLM_MODEL_DEFAULT are required when LLM_ENABLED=true",
  });

export type LlmConfig = z.infer<typeof llmConfigSchema>;

export function loadLlmConfig(env: Record<string, string | undefined> = process.env): LlmConfig {
  return llmConfigSchema.parse(env);
}
