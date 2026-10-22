import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { UsageEvent } from "@cairn/shared";
import { generateText as aiGenerateText, Output } from "ai";
import type { z } from "zod";
import type { LlmConfig } from "./config";
import { type FirewallResult, maskSensitive } from "./firewall";

export class LlmDisabledError extends Error {
  constructor() {
    super("The internal LLM is disabled (LLM_ENABLED=false). Use the deterministic fallback.");
  }
}

export class EgressBlockedError extends Error {
  constructor(host: string) {
    super(`Outbound call to "${host}" refused: only the internal LLM gateway is allowed.`);
  }
}

/** Rough estimate (about 4 characters per token). Always labeled Estimated, never Measured. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function truncateToTokens(text: string, maxTokens: number): string {
  const maxChars = maxTokens * 4;
  return text.length <= maxChars ? text : `${text.slice(0, maxChars)}\n[TRUNCATED]`;
}

/** fetch that only reaches the configured gateway host and enforces a timeout. */
export function createEgressFetch(baseUrl: string, timeoutMs: number): typeof fetch {
  const allowedHost = new URL(baseUrl).host;
  return async (input, init) => {
    const raw = typeof input === "string" || input instanceof URL ? input.toString() : input.url;
    const host = new URL(raw).host;
    if (host !== allowedHost) throw new EgressBlockedError(host);
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    return fetch(input, { ...init, signal });
  };
}

function parseAuthHeader(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  const i = raw.indexOf(":");
  if (i < 1) return {};
  return { [raw.slice(0, i).trim()]: raw.slice(i + 1).trim() };
}

export type ModelTier = "default" | "small";

export interface CallContext {
  /** Team the cost is attributed to. Never a person. */
  team: string;
  repo?: string;
  /** What the call is for, e.g. "docgen", "adr-draft". Stored as the tool name suffix. */
  task: string;
  tier?: ModelTier;
}

export interface LlmResult<T> {
  value: T;
  model: string;
  tokensIn: number;
  tokensOut: number;
  firewall: FirewallResult["findings"];
}

export type UsageSink = (event: UsageEvent) => void | Promise<void>;

export interface LlmClient {
  readonly enabled: boolean;
  generateText(args: { system?: string; prompt: string; ctx: CallContext }): Promise<LlmResult<string>>;
  generateObject<S extends z.ZodType>(args: {
    system?: string;
    prompt: string;
    schema: S;
    ctx: CallContext;
  }): Promise<LlmResult<z.infer<S>>>;
}

export function createLlmClient(config: LlmConfig, onUsage: UsageSink): LlmClient {
  if (!config.LLM_ENABLED || !config.LLM_BASE_URL) {
    const disabled = async () => {
      throw new LlmDisabledError();
    };
    return { enabled: false, generateText: disabled, generateObject: disabled };
  }

  const baseUrl = config.LLM_BASE_URL;
  const provider = createOpenAICompatible({
    name: "cacib-internal",
    baseURL: baseUrl,
    ...(config.LLM_API_KEY ? { apiKey: config.LLM_API_KEY } : {}),
    headers: parseAuthHeader(config.LLM_AUTH_HEADER),
    includeUsage: true,
    fetch: createEgressFetch(baseUrl, config.LLM_TIMEOUT_MS),
  });

  const modelName = (tier: ModelTier | undefined) =>
    (tier === "small" ? config.LLM_MODEL_SMALL : undefined) ?? (config.LLM_MODEL_DEFAULT as string);

  async function run<T>(
    args: { system?: string; prompt: string; ctx: CallContext },
    call: (model: ReturnType<typeof provider.chatModel>, system: string | undefined, prompt: string) => Promise<{
      value: T;
      tokensIn: number;
      tokensOut: number;
    }>,
  ): Promise<LlmResult<T>> {
    const model = modelName(args.ctx.tier);
    const maskedPrompt = maskSensitive(args.prompt);
    const maskedSystem = args.system ? maskSensitive(args.system) : undefined;
    const prompt = truncateToTokens(maskedPrompt.text, config.LLM_MAX_INPUT_TOKENS);
    const start = Date.now();
    let outcome: NonNullable<UsageEvent["outcome"]> = "ok";
    let tokensIn = 0;
    let tokensOut = 0;
    try {
      const r = await call(provider.chatModel(model), maskedSystem?.text, prompt);
      tokensIn = r.tokensIn;
      tokensOut = r.tokensOut;
      return {
        value: r.value,
        model,
        tokensIn,
        tokensOut,
        firewall: maskedPrompt.findings,
      };
    } catch (error) {
      outcome = "error";
      throw error;
    } finally {
      await onUsage({
        source: "platform",
        tool: `cairn-${args.ctx.task}`,
        model,
        team: args.ctx.team,
        ...(args.ctx.repo ? { repo: args.ctx.repo } : {}),
        ts: new Date().toISOString(),
        tokensIn,
        tokensOut,
        durationMs: Date.now() - start,
        outcome,
      });
    }
  }

  return {
    enabled: true,
    generateText: (args) =>
      run(args, async (model, system, prompt) => {
        const r = await aiGenerateText({
          model,
          ...(system ? { system } : {}),
          prompt,
          maxOutputTokens: config.LLM_MAX_OUTPUT_TOKENS,
        });
        return {
          value: r.text,
          tokensIn: r.usage.inputTokens ?? 0,
          tokensOut: r.usage.outputTokens ?? 0,
        };
      }),
    generateObject: (args) =>
      run(args, async (model, system, prompt) => {
        const r = await aiGenerateText({
          model,
          ...(system ? { system } : {}),
          prompt,
          maxOutputTokens: config.LLM_MAX_OUTPUT_TOKENS,
          output: Output.object({ schema: args.schema }),
        });
        return {
          value: r.output as z.infer<typeof args.schema>,
          tokensIn: r.usage.inputTokens ?? 0,
          tokensOut: r.usage.outputTokens ?? 0,
        };
      }),
  };
}
