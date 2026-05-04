import { DevSourceWatcher } from "./DevSourceWatcher";

export class DevSourceWatcherFactory {
  create(): DevSourceWatcher {
    return new DevSourceWatcher({
      startupGracePeriodMs: this.readGracePeriodOverride(),
    });
  }

  /**
   * Reads `CODEMATION_DEV_WATCH_GRACE_MS` so the dev-mode e2e tests can disable the
   * 20s startup grace period (which exists to keep `tsdown --watch` reboots from
   * triggering spurious runtime swaps in production). When the env var is unset or
   * unparseable, returns undefined so the constructor uses its production default.
   */
  private readGracePeriodOverride(): number | undefined {
    const raw = process.env.CODEMATION_DEV_WATCH_GRACE_MS;
    if (raw === undefined || raw.trim().length === 0) {
      return undefined;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return undefined;
    }
    return parsed;
  }
}
