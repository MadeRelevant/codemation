import { access } from "node:fs/promises";
import path from "node:path";

export type CliPaths = Readonly<{
  consumerRoot: string;
  repoRoot: string;
}>;

export class CliPathResolver {
  async resolve(consumerStartPath: string): Promise<CliPaths> {
    const consumerRoot = path.resolve(consumerStartPath);
    const repoRoot = await this.detectWorkspaceRoot(consumerRoot);
    return {
      consumerRoot,
      repoRoot: repoRoot ?? consumerRoot,
    };
  }

  private async detectWorkspaceRoot(startDirectory: string): Promise<string | null> {
    let currentDirectory = path.resolve(startDirectory);
    while (true) {
      if (await this.exists(path.resolve(currentDirectory, "pnpm-workspace.yaml"))) {
        return currentDirectory;
      }
      const parentDirectory = path.dirname(currentDirectory);
      if (parentDirectory === currentDirectory) {
        return null;
      }
      currentDirectory = parentDirectory;
    }
  }

  private async exists(filePath: string): Promise<boolean> {
    try {
      await access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
