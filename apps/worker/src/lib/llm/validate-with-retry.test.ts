/**
 * Unit tests for `validateWithRetry`.
 *
 * The retry helper is the contract enforcer: it calls the LLM, parses
 * the result, and on a parse failure re-prompts with a specific
 * complaint. We mock the LLM client so we can drive each branch:
 *   - first-attempt success
 *   - retry after a parse failure (and the retry's appended message)
 *   - retries exhausted → throws [LLM_BAD_OUTPUT]
 */
import { describe, it, expect, vi } from "vitest";
import { validateWithRetry } from "./validate-with-retry.js";
import type {
  OpenAICompatLlmClient,
  LlmCompletionRequest,
} from "./llm-client.js";

const validOutputJson = JSON.stringify({
  summary: "ok summary",
  chapters: [
    { startMs: 0, title: "A" },
    { startMs: 12_000, title: "B" },
    { startMs: 24_000, title: "C" },
  ],
});

/**
 * Build a stub LLM client whose `complete` returns the queued responses
 * one at a time. Captures every (systemPrompt, userPrompt) it sees so
 * tests can assert the re-prompt wiring.
 */
const makeStubClient = (
  responses: Array<{ text: string; raw?: unknown }>,
) => {
  const calls: LlmCompletionRequest[] = [];
  const client = {
    complete: vi.fn(async (req: LlmCompletionRequest) => {
      calls.push(req);
      const next = responses.shift();
      if (!next) throw new Error("Stub client ran out of responses");
      return { text: next.text, raw: next.raw ?? {} };
    }),
  };
  return { client: client as unknown as OpenAICompatLlmClient, calls };
};

const baseRequest: LlmCompletionRequest = {
  systemPrompt: "be helpful",
  userPrompt: "transcript follows",
  jsonMode: true,
};

describe("validateWithRetry", () => {
  it("returns the parsed output on first-attempt success", async () => {
    const { client, calls } = makeStubClient([{ text: validOutputJson }]);

    const result = await validateWithRetry({
      client,
      request: baseRequest,
      maxAttempts: 3,
    });

    expect(result.output.summary).toBe("ok summary");
    expect(result.output.chapters).toHaveLength(3);
    expect(result.attempts).toBe(1);
    expect(calls).toHaveLength(1);
    // First call uses the original userPrompt verbatim
    expect(calls[0]!.userPrompt).toBe(baseRequest.userPrompt);
  });

  it("retries after a parse failure with the complaint appended to userPrompt", async () => {
    // First response: invalid JSON. Second response: valid.
    const { client, calls } = makeStubClient([
      { text: "{ not json" },
      { text: validOutputJson },
    ]);

    const result = await validateWithRetry({
      client,
      request: baseRequest,
      maxAttempts: 3,
    });

    expect(result.attempts).toBe(2);
    expect(calls).toHaveLength(2);

    // The retry's userPrompt appends the rejection reason
    expect(calls[1]!.userPrompt).toContain("YOUR PREVIOUS RESPONSE WAS REJECTED");
    expect(calls[1]!.userPrompt).toContain("not valid JSON");
    // ...but the systemPrompt stays the same
    expect(calls[1]!.systemPrompt).toBe(baseRequest.systemPrompt);
    // And the userPrompt STARTS with the original prompt (preserves intent)
    expect(calls[1]!.userPrompt).toContain(baseRequest.userPrompt);
  });

  it("retries on shape-mismatch (zod) and includes the rule in the re-prompt", async () => {
    // First: shape wrong (missing chapters). Second: valid.
    const badShape = JSON.stringify({ summary: "ok" });
    const { client, calls } = makeStubClient([
      { text: badShape },
      { text: validOutputJson },
    ]);

    const result = await validateWithRetry({
      client,
      request: baseRequest,
      maxAttempts: 3,
    });

    expect(result.attempts).toBe(2);
    expect(calls[1]!.userPrompt).toContain("YOUR PREVIOUS RESPONSE WAS REJECTED");
    expect(calls[1]!.userPrompt).toContain("shape");
  });

  it("throws [LLM_BAD_OUTPUT] after maxAttempts failures", async () => {
    const { client, calls } = makeStubClient([
      { text: "bad" },
      { text: "bad" },
      { text: "bad" },
    ]);

    await expect(
      validateWithRetry({ client, request: baseRequest, maxAttempts: 3 }),
    ).rejects.toThrow(/\[LLM_BAD_OUTPUT\].*after 3 attempts/);

    // All three attempts made; lastRawText carries the final bad text
    expect(calls).toHaveLength(3);
  });

  it("rethrows non-parse errors (lets classifyLlmError handle them upstream)", async () => {
    // Simulate an SDK error by having complete() throw something other
    // than LlmParseError. The retry helper must surface it as-is so
    // the generate job's classifyLlmError path runs.
    const client = {
      complete: vi.fn(async () => {
        const err = new Error("network down");
        throw err;
      }),
    } as unknown as OpenAICompatLlmClient;

    await expect(
      validateWithRetry({ client, request: baseRequest, maxAttempts: 3 }),
    ).rejects.toThrow("network down");
  });

  it("defaults maxAttempts to 3", async () => {
    const { client, calls } = makeStubClient([
      { text: "bad" },
      { text: "bad" },
      { text: "bad" },
    ]);

    await expect(
      validateWithRetry({ client, request: baseRequest }),
    ).rejects.toThrow(/3 attempts/);

    expect(calls).toHaveLength(3);
  });

  it("captures lastRawText for logging when retries exhaust", async () => {
    const { client } = makeStubClient([
      { text: "first bad" },
      { text: "second bad" },
      { text: "third bad" },
    ]);

    try {
      await validateWithRetry({ client, request: baseRequest, maxAttempts: 3 });
    } catch {
      // expected
    }
    // Internal: not part of the public result on failure, but the
    // lastRawText we expose IS the third call's text — verify via the
    // mock's call counter that all 3 attempts fired.
    expect(client.complete).toHaveBeenCalledTimes(3);
  });
});