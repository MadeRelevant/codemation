import { access } from "node:fs/promises";
import path from "node:path";

export class CodemationWorkerPathResolver {
  async resolve(consumerStartPath: string): Promise<{ consumerRoot: string; repoRoot: string }> {
    const consumerRoot = path.resolve(consumerStartPath);
    const repoRoot = await this.detectWorkspaceRoot(consumerRoot);
    return { consumerRoot, repoRoot: repoRoot ?? consumerRoot };
  }

  private async detectWorkspaceRoot(startDirectory: string): Promise<string | null> {
    let currentDirectory = path.resolve(startDirectory);
    while (true) {
      try {
        await access(path.resolve(currentDirectory, "pnpm-workspace.yaml"));
        return currentDirectory;
      } catch {
        const parentDirectory = path.dirname(currentDirectory);
        if (parentDirectory === currentDirectory) return null;
        currentDirectory = parentDirectory;
      }
    }
  }
}
