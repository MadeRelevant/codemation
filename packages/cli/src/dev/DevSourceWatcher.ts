import type { FSWatcher } from "chokidar";
import { watch } from "chokidar";
import path from "node:path";

export class DevSourceWatcher {
  private static readonly ignoredDirectoryNames = new Set([
    ".codemation",
    ".git",
    ".next",
    "coverage",
    "dist",
    "node_modules",
  ]);

  /**
   * Suppress watch events for the first `startupGracePeriodMs` so that workspace plugins
   * built by `tsdown --watch` (which on dev start rewrites their entire `dist/` whether or
   * not the source actually changed) don't spuriously trigger a full runtime swap before
   * the dev session has even reached steady state. The runtime already loaded the latest
   * dist on boot; reloading it again with the same content just spends 1–2 GB of memory we
   * don't have on an 8-GB WSL box, where it stacks with next-server's compile spike to OOM.
   * Tests pass `0` to disable the grace period.
   */
  private static readonly DEFAULT_STARTUP_GRACE_PERIOD_MS = 20_000;
  private static readonly DEFAULT_DEBOUNCE_MS = 750;

  private readonly startupGracePeriodMs: number;
  private readonly debounceMs: number;
  private watcher: FSWatcher | null = null;
  private debounceTimeout: NodeJS.Timeout | null = null;
  private readonly changedPathsBuffer = new Set<string>();
  private explicitIgnoredRoots = new Set<string>();
  private startedAtMs = 0;

  constructor(options: Readonly<{ startupGracePeriodMs?: number; debounceMs?: number }> = {}) {
    this.startupGracePeriodMs = options.startupGracePeriodMs ?? DevSourceWatcher.DEFAULT_STARTUP_GRACE_PERIOD_MS;
    this.debounceMs = options.debounceMs ?? DevSourceWatcher.DEFAULT_DEBOUNCE_MS;
  }

  async start(
    args: Readonly<{
      roots: ReadonlyArray<string>;
      onChange: (ctx: Readonly<{ changedPaths: ReadonlyArray<string> }>) => Promise<void>;
    }>,
  ): Promise<void> {
    if (this.watcher) {
      return;
    }
    this.startedAtMs = Date.now();
    this.explicitIgnoredRoots = new Set(
      args.roots
        .map((rootPath) => path.resolve(rootPath))
        .filter((rootPath) => this.pathContainsIgnoredDirectory(rootPath))
        .map((rootPath) => rootPath.replace(/\\/g, "/")),
    );
    this.watcher = watch([...args.roots], {
      ignoreInitial: true,
      ignored: (watchPath: string) => this.isIgnoredPath(watchPath),
    });
    this.watcher.on("all", (_eventName, watchPath) => {
      if (typeof watchPath !== "string" || watchPath.length === 0) {
        return;
      }
      if (this.isIgnoredPath(watchPath)) {
        return;
      }
      if (!this.isRelevantPath(watchPath)) {
        return;
      }
      // Drop events that arrive in the startup grace period. After the grace period a real
      // user edit still triggers a normal source-change → runtime swap.
      if (Date.now() - this.startedAtMs < this.startupGracePeriodMs) {
        return;
      }
      this.changedPathsBuffer.add(path.resolve(watchPath));
      this.scheduleDebouncedChange(args.onChange);
    });
  }

  async stop(): Promise<void> {
    if (this.debounceTimeout) {
      clearTimeout(this.debounceTimeout);
      this.debounceTimeout = null;
    }
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
    this.explicitIgnoredRoots.clear();
  }

  private scheduleDebouncedChange(
    onChange: (ctx: Readonly<{ changedPaths: ReadonlyArray<string> }>) => Promise<void>,
  ): void {
    if (this.debounceTimeout) {
      clearTimeout(this.debounceTimeout);
    }
    // Default 750 ms (was 75): a single `tsdown --watch` rebuild writes a dozen-plus
    // `dist/` files (entry, chunks, .d.ts, .map) over several hundred ms — collapsing those
    // into ONE runtime swap, not a dozen, prevents memory spikes that OOM-kill next-server.
    this.debounceTimeout = setTimeout(() => {
      this.debounceTimeout = null;
      void this.flushPendingChange(onChange);
    }, this.debounceMs);
  }

  private async flushPendingChange(
    onChange: (ctx: Readonly<{ changedPaths: ReadonlyArray<string> }>) => Promise<void>,
  ): Promise<void> {
    if (this.changedPathsBuffer.size === 0) {
      return;
    }
    const changedPaths = [...this.changedPathsBuffer];
    this.changedPathsBuffer.clear();
    await onChange({ changedPaths });
  }

  private isIgnoredPath(watchPath: string): boolean {
    const normalized = path.resolve(watchPath).replace(/\\/g, "/");
    if (this.isInsideExplicitIgnoredRoot(normalized)) {
      return false;
    }
    return normalized.split("/").some((segment: string) => DevSourceWatcher.ignoredDirectoryNames.has(segment));
  }

  private pathContainsIgnoredDirectory(rootPath: string): boolean {
    return rootPath
      .replace(/\\/g, "/")
      .split("/")
      .some((segment: string) => DevSourceWatcher.ignoredDirectoryNames.has(segment));
  }

  private isInsideExplicitIgnoredRoot(normalizedWatchPath: string): boolean {
    for (const explicitIgnoredRoot of this.explicitIgnoredRoots) {
      const relativePath = path.relative(explicitIgnoredRoot, normalizedWatchPath);
      if (relativePath.length === 0 || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))) {
        return true;
      }
    }
    return false;
  }

  private isRelevantPath(watchPath: string): boolean {
    const fileName = path.basename(watchPath);
    if (fileName === ".env" || fileName.startsWith(".env.")) {
      return true;
    }
    const extension = path.extname(watchPath).toLowerCase();
    return (
      extension === ".cts" ||
      extension === ".cjs" ||
      extension === ".js" ||
      extension === ".json" ||
      extension === ".jsx" ||
      extension === ".mts" ||
      extension === ".mjs" ||
      extension === ".prisma" ||
      extension === ".ts" ||
      extension === ".tsx"
    );
  }
}
