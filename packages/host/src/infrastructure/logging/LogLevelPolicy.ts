import type { CodemationLogConfig, CodemationLogRule } from "../../presentation/config/CodemationLogConfig";

export type LogLevel = "silent" | "debug" | "info" | "warn" | "error";

const levelRank: Record<Exclude<LogLevel, "silent">, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const globRegexMetaChars = new Set("\\^$+?()[]{}|.");

/**
 * Minimum log level for @codemation/host loggers.
 * - `CODEMATION_LOG_LEVEL` overrides when set to a known level (for namespaces not matched by `codemation.config` log rules).
 * - Under Vitest, defaults to **warn** so routine `info`/`debug` noise stays off the terminal; `warn`/`error` still print.
 * - Otherwise defaults to **info**.
 *
 * When {@link applyCodemationLogConfig} is set, the first matching rule wins per namespace; unmatched namespaces use env defaults.
 *
 * Resolve a shared instance via {@link LogLevelPolicyFactory} (DI or `logLevelPolicyFactory`).
 */
export class LogLevelPolicy {
  private cachedMin: LogLevel | undefined;

  private codemationRules: ReadonlyArray<{ matchers: ReadonlyArray<RegExp>; minLevel: LogLevel }> | null = null;

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
    this.codemationRules = null;
  }

  /**
   * Applies `codemation.config` log rules. Pass `undefined` to clear rules and use env-only behavior.
   */
  applyCodemationLogConfig(config: CodemationLogConfig | undefined): void {
    this.codemationRules = null;
    if (!config) {
      return;
    }
    const rawRules = this.normalizeCodemationRules(config);
    if (rawRules.length === 0) {
      return;
    }
    const compiled: { matchers: ReadonlyArray<RegExp>; minLevel: LogLevel }[] = [];
    for (const rule of rawRules) {
      const minLevel = this.parseRuleLevel(rule.level);
      const patterns = this.normalizeFilterPatterns(rule.filter);
      if (patterns.length === 0) {
        throw new Error("codemation.config log rule filter must include at least one pattern");
      }
      const matchers = patterns.map((pattern) => this.compileGlobPattern(pattern));
      compiled.push({
        matchers,
        minLevel,
      });
    }
    this.codemationRules = compiled;
  }

  shouldEmit(level: Exclude<LogLevel, "silent">, namespace: string): boolean {
    if (this.codemationRules && this.codemationRules.length > 0) {
      for (const rule of this.codemationRules) {
        if (rule.matchers.some((regex) => regex.test(namespace))) {
          return this.levelPassesAgainstMin(level, rule.minLevel);
        }
      }
    }
    return this.levelPassesAgainstMin(level, this.minLevelCached());
  }

  private normalizeCodemationRules(config: CodemationLogConfig): ReadonlyArray<CodemationLogRule> {
    if ("rules" in config && Array.isArray(config.rules)) {
      return [...config.rules];
    }
    return [config as CodemationLogRule];
  }

  private normalizeFilterPatterns(filter: string | ReadonlyArray<string>): ReadonlyArray<string> {
    if (typeof filter === "string") {
      return [filter];
    }
    return [...filter];
  }

  /**
   * Glob: only `*` is special (matches any substring). A lone `*` matches all namespaces.
   */
  private compileGlobPattern(pattern: string): RegExp {
    const trimmed = pattern.trim();
    if (trimmed === "*") {
      return /^.*$/;
    }
    let body = "";
    for (const ch of trimmed) {
      if (ch === "*") {
        body += ".*";
        continue;
      }
      if (globRegexMetaChars.has(ch)) {
        body += "\\" + ch;
        continue;
      }
      body += ch;
    }
    return new RegExp("^" + body + "$");
  }

  private parseRuleLevel(level: string): LogLevel {
    const normalized = level.toLowerCase();
    if (
      normalized === "silent" ||
      normalized === "debug" ||
      normalized === "info" ||
      normalized === "warn" ||
      normalized === "error"
    ) {
      return normalized;
    }
    throw new Error(`Invalid codemation.config log level: ${level}`);
  }

  private levelPassesAgainstMin(level: Exclude<LogLevel, "silent">, min: LogLevel): boolean {
    if (min === "silent") {
      return false;
    }
    return levelRank[level] >= levelRank[min];
  }
}
