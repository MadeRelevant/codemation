import { readdir } from "node:fs/promises";
import path from "node:path";

export class CodemationWorkflowFileCollector {
  async collect(workflowsDirectory: string): Promise<ReadonlyArray<string>> {
    const files = await this.collectRecursive(workflowsDirectory);
    const supportedFiles = files.filter((filePath) => this.isSupportedWorkflowFile(filePath));
    const nonIndexFiles = supportedFiles.filter((filePath) => !this.isIndexFile(filePath));
    return nonIndexFiles.length > 0 ? nonIndexFiles : supportedFiles;
  }

  private async collectRecursive(targetDirectory: string): Promise<ReadonlyArray<string>> {
    const entries = await readdir(targetDirectory, { withFileTypes: true });
    const collected: string[] = [];
    for (const entry of entries) {
      const entryPath = path.resolve(targetDirectory, entry.name);
      if (entry.isDirectory()) {
        collected.push(...(await this.collectRecursive(entryPath)));
        continue;
      }
      collected.push(entryPath);
    }
    return collected;
  }

  private isSupportedWorkflowFile(filePath: string): boolean {
    if (filePath.endsWith(".d.ts")) return false;
    return [".ts", ".tsx", ".js", ".mjs", ".mts"].some((extension) => filePath.endsWith(extension));
  }

  private isIndexFile(filePath: string): boolean {
    const parsed = path.parse(filePath);
    return parsed.name === "index";
  }
}
