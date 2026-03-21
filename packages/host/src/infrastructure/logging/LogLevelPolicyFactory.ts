import { LogLevelPolicy } from "./LogLevelPolicy";

/**
 * Process-wide {@link LogLevelPolicy} singleton for server and browser loggers.
 * Plain class (no `@injectable` from `@codemation/core`): client components import this file; decorating would pull core into the browser bundle.
 */
export class LogLevelPolicyFactory {
  private readonly policy = new LogLevelPolicy();

  create(): LogLevelPolicy {
    return this.policy;
  }
}

/** Shared factory for call sites outside the DI container (e.g. next-host bootstrap). */
export const logLevelPolicyFactory = new LogLevelPolicyFactory();
