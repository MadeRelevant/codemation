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

  private watcher: FSWatcher | null = null;
  private debounceTimeout: NodeJS.Timeout | null = null;
  private readonly changedPathsBuffer = new Set<string>();
  private explicitIgnoredRoots = new Set<string>();

  async start(
    args: Readonly<{
      roots: ReadonlyArray<string>;
      onChange: (ctx: Readonly<{ changedPaths: ReadonlyArray<string> }>) => Promise<void>;
    }>,
  ): Promise<void> {
    if (this.watcher) {
      return;
    }
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
      if (!this.isRelevantPath(watchPath)) {
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
    this.debounceTimeout = setTimeout(() => {
      this.debounceTimeout = null;
      void this.flushPendingChange(onChange);
    }, 75);
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
