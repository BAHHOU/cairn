import { describe, expect, it } from "vitest";
import { createEgressFetch, EgressBlockedError, createLlmClient, LlmDisabledError } from "./client";
import { loadLlmConfig } from "./config";
import { maskSensitive } from "./firewall";

describe("config", () => {
  it("is disabled by default", () => {
    expect(loadLlmConfig({}).LLM_ENABLED).toBe(false);
  });
  it("requires a base URL and a model when enabled", () => {
    expect(() => loadLlmConfig({ LLM_ENABLED: "true" })).toThrow();
    const ok = loadLlmConfig({
      LLM_ENABLED: "true",
      LLM_BASE_URL: "https://llm.internal.example/v1",
      LLM_MODEL_DEFAULT: "model-a",
    });
    expect(ok.LLM_ENABLED).toBe(true);
  });
});

describe("client", () => {
  it("refuses to call when disabled", async () => {
    const client = createLlmClient(loadLlmConfig({}), () => {});
    expect(client.enabled).toBe(false);
    await expect(
      client.generateText({ prompt: "hi", ctx: { team: "t", task: "docgen" } }),
    ).rejects.toBeInstanceOf(LlmDisabledError);
  });
  it("blocks any host other than the gateway", async () => {
    const f = createEgressFetch("https://llm.internal.example/v1", 1000);
    await expect(f("https://api.openai.com/v1/chat/completions")).rejects.toBeInstanceOf(
      EgressBlockedError,
    );
  });
});

describe("firewall", () => {
  it("masks secrets and keeps only counts", () => {
    const input = [
      "password = hunter2secret",
      "key AKIAABCDEFGHIJKLMNOP",
      "-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----",
    ].join("\n");
    const { text, findings } = maskSensitive(input);
    expect(text).not.toContain("hunter2secret");
    expect(text).not.toContain("AKIAABCDEFGHIJKLMNOP");
    expect(text).not.toContain("BEGIN RSA");
    expect(findings["credential-assignment"]).toBe(1);
    expect(findings["api-key"]).toBe(1);
    expect(findings["private-key"]).toBe(1);
  });
});
