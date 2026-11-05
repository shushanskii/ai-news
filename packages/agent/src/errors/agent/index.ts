import type { AgentFailure } from "#types/agent";

/**
 * One error type for everything that can stop a run, carrying which part stopped it.
 *
 * The service catches this and nothing else: an `AgentError` is an expected failure with a message
 * worth returning to the caller, while anything uncaught is a bug and keeps its stack for the log.
 */
export class AgentError extends Error {
  readonly failure: AgentFailure;

  constructor(failure: AgentFailure, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "AgentError";
    this.failure = failure;
  }
}

/** Whatever a rejected promise or a thrown value is worth as a sentence. */
export function toMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
