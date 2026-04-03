export class WorkflowDurationParser {
  static parse(duration: number | string): number {
    if (typeof duration === "number") {
      return Number.isFinite(duration) && duration > 0 ? Math.floor(duration) : 0;
    }
    const normalized = duration.trim().toLowerCase();
    const match = normalized.match(/^(\d+)(ms|s|m|h)$/);
    if (!match) {
      throw new Error(
        `Unsupported wait duration "${duration}". Use a number of milliseconds or values like "500ms", "2s", "5m".`,
      );
    }
    const value = Number(match[1]);
    const unit = match[2];
    if (unit === "ms") {
      return value;
    }
    if (unit === "s") {
      return value * 1000;
    }
    if (unit === "m") {
      return value * 60_000;
    }
    return value * 3_600_000;
  }
}
