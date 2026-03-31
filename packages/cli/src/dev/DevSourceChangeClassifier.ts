import path from "node:path";

export class DevSourceChangeClassifier {
  private static readonly configFileNames = new Set([
    "codemation.config.ts",
    "codemation.config.js",
    "codemation.config.mjs",
  ]);

  shouldRepublishConsumerOutput(
    args: Readonly<{
      changedPaths: ReadonlyArray<string>;
      consumerRoot: string;
    }>,
  ): boolean {
    const resolvedConsumerRoot = path.resolve(args.consumerRoot);
    return args.changedPaths.some((changedPath) => this.isPathInsideDirectory(changedPath, resolvedConsumerRoot));
  }

  requiresUiRestart(
    args: Readonly<{
      changedPaths: ReadonlyArray<string>;
      consumerRoot: string;
    }>,
  ): boolean {
    const resolvedConsumerRoot = path.resolve(args.consumerRoot);
    return args.changedPaths.some((changedPath) =>
      this.pathRequiresUiRestart(path.resolve(changedPath), resolvedConsumerRoot),
    );
  }

  private isPathInsideDirectory(filePath: string, directoryPath: string): boolean {
    const resolvedFilePath = path.resolve(filePath);
    const relativePath = path.relative(directoryPath, resolvedFilePath);
    return relativePath.length === 0 || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
  }

  private pathRequiresUiRestart(resolvedPath: string, consumerRoot: string): boolean {
    if (!this.isPathInsideDirectory(resolvedPath, consumerRoot)) {
      return false;
    }
    const relativePath = path.relative(consumerRoot, resolvedPath);
    if (DevSourceChangeClassifier.configFileNames.has(path.basename(relativePath))) {
      // Config changes affect auth and branding projections consumed by the packaged Next host.
      return true;
    }
    if (relativePath.startsWith(path.join("src", "workflows"))) {
      return false;
    }
    if (relativePath.startsWith(path.join("src", "plugins"))) {
      return false;
    }
    if (relativePath.includes("credential")) {
      // Credential type edits still require a packaged UI restart until the credentials screen live-refreshes.
      return true;
    }
    return false;
  }
}
