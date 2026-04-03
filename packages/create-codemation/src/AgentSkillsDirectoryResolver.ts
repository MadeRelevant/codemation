import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

export class AgentSkillsDirectoryResolver {
  constructor(private readonly importMetaUrl: string) {}

  resolveSkillsRoot(): string {
    try {
      const require = createRequire(this.importMetaUrl);
      const packageJsonPath = require.resolve("@codemation/agent-skills/package.json");
      return path.join(path.dirname(packageJsonPath), "skills");
    } catch {
      return this.resolveWorkspaceSkillsRoot();
    }
  }

  private resolveWorkspaceSkillsRoot(): string {
    const sourceDirectory = path.dirname(fileURLToPath(this.importMetaUrl));
    const packageRoot = path.join(sourceDirectory, "..");
    return path.resolve(packageRoot, "..", "agent-skills", "skills");
  }
}
