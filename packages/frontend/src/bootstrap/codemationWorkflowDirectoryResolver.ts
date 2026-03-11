import path from "node:path";
import { CodemationFileExistenceChecker } from "./codemationFileExistenceChecker";

export class CodemationWorkflowDirectoryResolver {
  private readonly fileExistenceChecker = new CodemationFileExistenceChecker();

  async resolve(args: Readonly<{ consumerRoot: string; env?: Readonly<Record<string, string | undefined>>; workflowsDirectoryOverride?: string }>): Promise<string | null> {
    const explicitDirectory = args.workflowsDirectoryOverride ?? args.env?.CODEMATION_WORKFLOWS_DIR;
    if (explicitDirectory) return await this.resolveExplicitDirectory(args.consumerRoot, explicitDirectory);
    for (const candidate of this.getConventionCandidates(args.consumerRoot)) {
      if (await this.fileExistenceChecker.exists(candidate)) return candidate;
    }
    return null;
  }

  private async resolveExplicitDirectory(consumerRoot: string, explicitDirectory: string): Promise<string> {
    const resolvedDirectory = path.isAbsolute(explicitDirectory) ? explicitDirectory : path.resolve(consumerRoot, explicitDirectory);
    if (await this.fileExistenceChecker.exists(resolvedDirectory)) return resolvedDirectory;
    throw new Error(`Workflow directory not found: ${resolvedDirectory}`);
  }

  private getConventionCandidates(consumerRoot: string): ReadonlyArray<string> {
    return [
      path.resolve(consumerRoot, "src", "workflows"),
      path.resolve(consumerRoot, "workflows"),
    ];
  }
}
