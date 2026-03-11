import path from "node:path";
import { CodemationFileExistenceChecker } from "./codemationFileExistenceChecker";

export class CodemationBootstrapFileResolver {
  private readonly fileExistenceChecker = new CodemationFileExistenceChecker();

  async resolve(args: Readonly<{ consumerRoot: string; env?: Readonly<Record<string, string | undefined>>; bootstrapPathOverride?: string }>): Promise<string | null> {
    const explicitPath = args.bootstrapPathOverride ?? args.env?.CODEMATION_BOOTSTRAP_FILE;
    if (explicitPath) return await this.resolveExplicitPath(args.consumerRoot, explicitPath);
    for (const candidate of this.getConventionCandidates(args.consumerRoot)) {
      if (await this.fileExistenceChecker.exists(candidate)) return candidate;
    }
    return null;
  }

  private async resolveExplicitPath(consumerRoot: string, explicitPath: string): Promise<string> {
    const resolvedPath = path.isAbsolute(explicitPath) ? explicitPath : path.resolve(consumerRoot, explicitPath);
    if (await this.fileExistenceChecker.exists(resolvedPath)) return resolvedPath;
    throw new Error(`Bootstrap file not found: ${resolvedPath}`);
  }

  private getConventionCandidates(consumerRoot: string): ReadonlyArray<string> {
    return [
      path.resolve(consumerRoot, "codemation.config.ts"),
      path.resolve(consumerRoot, "codemation.config.js"),
      path.resolve(consumerRoot, "src", "codemation.config.ts"),
      path.resolve(consumerRoot, "src", "codemation.config.js"),
    ];
  }
}
