import path from "node:path";

export class DevSourceChangeClassifier {
  shouldRepublishConsumerOutput(
    args: Readonly<{
      changedPaths: ReadonlyArray<string>;
      consumerRoot: string;
    }>,
  ): boolean {
    const resolvedConsumerRoot = path.resolve(args.consumerRoot);
    return args.changedPaths.some((changedPath) => this.isPathInsideDirectory(changedPath, resolvedConsumerRoot));
  }

  requiresNextHostRestart(
    args: Readonly<{
      changedPaths: ReadonlyArray<string>;
      consumerRoot: string;
    }>,
  ): boolean {
    const configPaths = new Set(this.resolveConfigPaths(args.consumerRoot));
    return args.changedPaths.some((changedPath) => configPaths.has(path.resolve(changedPath)));
  }

  private resolveConfigPaths(consumerRoot: string): ReadonlyArray<string> {
    const resolvedConsumerRoot = path.resolve(consumerRoot);
    return [
      path.resolve(resolvedConsumerRoot, "codemation.config.ts"),
      path.resolve(resolvedConsumerRoot, "codemation.config.js"),
      path.resolve(resolvedConsumerRoot, "src", "codemation.config.ts"),
      path.resolve(resolvedConsumerRoot, "src", "codemation.config.js"),
    ];
  }

  private isPathInsideDirectory(filePath: string, directoryPath: string): boolean {
    const resolvedFilePath = path.resolve(filePath);
    const relativePath = path.relative(directoryPath, resolvedFilePath);
    return relativePath.length === 0 || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
  }
}
