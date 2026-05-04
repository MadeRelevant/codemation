/**
 * Minimal logger surface for the polling-trigger runtime.
 * Hosts supply this via {@link EngineDeps.pollingTriggerLogger};
 * when absent the runtime is silent.
 */
export interface PollingTriggerLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string, exception?: Error): void;
  debug(message: string): void;
}

export class NoOpPollingTriggerLogger implements PollingTriggerLogger {
  info(): void {}
  warn(): void {}
  error(): void {}
  debug(): void {}
}
