import path from "node:path";

export type ConsumerOutputWatchEvent = Readonly<{
  event: string;
  path: string;
}>;

export type ConsumerOutputRebuildClassification =
  | Readonly<{
      kind: "full";
    }>
  | Readonly<{
      kind: "incremental";
      sourcePaths: ReadonlyArray<string>;
    }>;

export class ConsumerOutputSourceChangeClassifier {
  private static readonly ignoredDirectoryNames = new Set([".codemation", ".git", "dist", "node_modules"]);
  private static readonly supportedSourceExtensions = new Set([".ts", ".tsx", ".mts", ".cts"]);

  classifyRebuild(
    args: Readonly<{
      configSourcePath: string;
      events: ReadonlyArray<ConsumerOutputWatchEvent>;
    }>,
  ): ConsumerOutputRebuildClassification {
    const incrementalSourcePaths = new Set<string>();
    const resolvedConfigPath = path.resolve(args.configSourcePath);
    for (const entry of args.events) {
      if (entry.event !== "change") {
        return { kind: "full" };
      }
      if (path.resolve(entry.path) === resolvedConfigPath) {
        return { kind: "full" };
      }
      if (this.isAssetPath(entry.path)) {
        return { kind: "full" };
      }
      if (!this.isEmitSourcePath(entry.path)) {
        continue;
      }
      incrementalSourcePaths.add(path.resolve(entry.path));
    }
    if (incrementalSourcePaths.size === 0) {
      return { kind: "full" };
    }
    return {
      kind: "incremental",
      sourcePaths: [...incrementalSourcePaths],
    };
  }

  createIgnoredMatcher(consumerRoot: string): (watchPath: string) => boolean {
    return (watchPath: string): boolean => {
      const relativePath = path.relative(consumerRoot, watchPath);
      if (relativePath.startsWith("..")) {
        return false;
      }
      return relativePath
        .replace(/\\/g, "/")
        .split("/")
        .some((segment: string) => ConsumerOutputSourceChangeClassifier.ignoredDirectoryNames.has(segment));
    };
  }

  getSupportedSourceExtensions(): ReadonlyArray<string> {
    return [...ConsumerOutputSourceChangeClassifier.supportedSourceExtensions];
  }

  isEmitSourcePath(sourcePath: string): boolean {
    if (this.isAssetPath(sourcePath)) {
      return true;
    }
    if (sourcePath.endsWith(".d.ts")) {
      return false;
    }
    return ConsumerOutputSourceChangeClassifier.supportedSourceExtensions.has(path.extname(sourcePath));
  }

  isSourceExtension(extension: string): boolean {
    return ConsumerOutputSourceChangeClassifier.supportedSourceExtensions.has(extension);
  }

  isAssetPath(sourcePath: string): boolean {
    const fileName = path.basename(sourcePath);
    return fileName === ".env" || fileName.startsWith(".env.");
  }
}
