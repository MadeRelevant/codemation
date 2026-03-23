import type { FSWatcher } from "chokidar";
import { watch } from "chokidar";
import path from "node:path";

export class CodemationDevSourceWatcher {
  private static readonly ignoredDirectoryNames = new Set([".codemation", ".git", ".next", "coverage", "dist", "node_modules"]);

  private watcher: FSWatcher | null = null;
  private debounceTimeout: NodeJS.Timeout | null = null;
  private pendingChange = false;

  async start(args: Readonly<{
    roots: ReadonlyArray<string>;
    onChange: () => Promise<void>;
  }>): Promise<void> {
    if (this.watcher) {
      return;
    }
    this.watcher = watch([...args.roots], {
      ignoreInitial: true,
      ignored: (watchPath: string) => this.isIgnoredPath(watchPath),
    });
    this.watcher.on("all", (_eventName, watchPath) => {
      if (typeof watchPath !== "string" || watchPath.length === 0) {
        return;
      }
      if (!this.isRelevantPath(watchPath)) {
        return;
      }
      this.pendingChange = true;
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
  }

  private scheduleDebouncedChange(onChange: () => Promise<void>): void {
    if (this.debounceTimeout) {
      clearTimeout(this.debounceTimeout);
    }
    this.debounceTimeout = setTimeout(() => {
      this.debounceTimeout = null;
      void this.flushPendingChange(onChange);
    }, 75);
  }

  private async flushPendingChange(onChange: () => Promise<void>): Promise<void> {
    if (!this.pendingChange) {
      return;
    }
    this.pendingChange = false;
    await onChange();
  }

  private isIgnoredPath(watchPath: string): boolean {
    const normalized = path.resolve(watchPath).replace(/\\/g, "/");
    return normalized
      .split("/")
      .some((segment: string) => CodemationDevSourceWatcher.ignoredDirectoryNames.has(segment));
  }

  private isRelevantPath(watchPath: string): boolean {
    const fileName = path.basename(watchPath);
    if (fileName === ".env" || fileName.startsWith(".env.")) {
      return true;
    }
    const extension = path.extname(watchPath).toLowerCase();
    return extension === ".cts"
      || extension === ".cjs"
      || extension === ".js"
      || extension === ".json"
      || extension === ".jsx"
      || extension === ".mts"
      || extension === ".mjs"
      || extension === ".prisma"
      || extension === ".ts"
      || extension === ".tsx";
  }
}
