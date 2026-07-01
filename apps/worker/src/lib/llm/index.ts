/**
 * Public surface of the LLM library.
 *
 * Everything the `generate` job needs to talk to an OpenAI-compatible
 * LLM (NVIDIA NIM by default), validate the response, and classify
 * errors. Kept in a single barrel so call sites import from one path.
 */
export {
  OpenAICompatLlmClient,
  buildLlmClient,
  type LlmCompletionRequest,
  type LlmCompletionResult,
} from "./llm-client.js";
export { classifyLlmError, type ClassifiedLlmError, type LlmErrorKind } from "./llm-errors.js";
export {
  buildSelectHighlightsPrompt,
  type SelectHighlightsPrompt,
  type SelectHighlightsPromptInput,
} from "./prompts/select-highlights.js";
export {
  LlmOutputSchema,
  LlmParseError,
  parseLlmOutput,
  type LlmOutput,
} from "./schemas.js";
export {
  validateWithRetry,
  type ValidateWithRetryOptions,
  type ValidateWithRetryResult,
} from "./validate-with-retry.js";
// `AaiTranscript` lives in the transcription lib; re-exported here so
// the `generate` job can stay on a single import path. Kept as a
// type-only re-export so the value-level barrel size doesn't grow.
export type { AaiTranscript, AaiChapter } from "../transcription/assemblyai.js";
