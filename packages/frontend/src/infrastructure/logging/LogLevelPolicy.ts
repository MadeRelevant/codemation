export type LogLevel = "silent" | "debug" | "info" | "warn" | "error";

const levelRank: Record<Exclude<LogLevel, "silent">, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Minimum log level for @codemation/frontend loggers.
 * - `CODEMATION_LOG_LEVEL` overrides when set to a known level.
 * - Under Vitest, defaults to **warn** so routine `info`/`debug` noise stays off the terminal; `warn`/`error` still print.
 * - Otherwise defaults to **info**.
 *
 * Resolve a shared instance via {@link LogLevelPolicyFactory} (DI or `logLevelPolicyFactory`).
 */
export class LogLevelPolicy {
  private cachedMin: LogLevel | undefined;

  resolveMin(): LogLevel {
    const raw = process.env.CODEMATION_LOG_LEVEL?.toLowerCase();
    if (raw === "silent" || raw === "debug" || raw === "info" || raw === "warn" || raw === "error") {
      return raw;
    }
    if (process.env.VITEST === "true") {
      return "warn";
    }
    return "info";
  }

  private minLevelCached(): LogLevel {
    if (this.cachedMin === undefined) {
      this.cachedMin = this.resolveMin();
    }
    return this.cachedMin;
  }

  resetForTests(): void {
    this.cachedMin = undefined;
  }

  shouldEmit(level: Exclude<LogLevel, "silent">): boolean {
    const min = this.minLevelCached();
    if (min === "silent") {
      return false;
    }
    return levelRank[level] >= levelRank[min];
  }
}
