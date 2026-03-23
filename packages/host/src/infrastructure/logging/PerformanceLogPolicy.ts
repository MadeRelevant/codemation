/**
 * Opt-in detailed timing / diagnostics lines (used with `ServerLoggerFactory#createPerformanceDiagnostics`).
 *
 * Set `CODEMATION_PERFORMANCE_LOGGING=true` to enable. Otherwise those loggers are silent regardless of level.
 */
export class PerformanceLogPolicy {
  shouldEmitDetailedTiming(): boolean {
    return process.env.CODEMATION_PERFORMANCE_LOGGING === "true";
  }
}
