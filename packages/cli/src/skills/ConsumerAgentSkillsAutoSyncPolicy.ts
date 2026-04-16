import { access, readFile } from "node:fs/promises";
import path from "node:path";

export interface ConsumerAgentSkillsSyncRequest {
  readonly mode?: "automatic" | "manual";
  readonly repoRoot?: string;
  readonly verbose?: boolean;
}

export class ConsumerAgentSkillsAutoSyncPolicy {
  async shouldSync(consumerRoot: string, request: ConsumerAgentSkillsSyncRequest = {}): Promise<boolean> {
    if (request.mode === "manual") {
      return true;
    }
    return !(await this.isFrameworkMonorepoRoot(request.repoRoot ?? consumerRoot));
  }

  private async isFrameworkMonorepoRoot(rootPath: string): Promise<boolean> {
    const packageJson = await this.readPackageName(path.join(rootPath, "package.json"));
    if (packageJson !== "codemation") {
      return false;
    }
    return (
      (await this.exists(path.join(rootPath, "packages", "cli", "package.json"))) &&
      (await this.exists(path.join(rootPath, "packages", "agent-skills", "package.json")))
    );
  }

  private async readPackageName(packageJsonPath: string): Promise<string | null> {
    try {
      const contents = await readFile(packageJsonPath, "utf8");
      const parsed = JSON.parse(contents) as { name?: unknown };
      return typeof parsed.name === "string" ? parsed.name : null;
    } catch {
      return null;
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
