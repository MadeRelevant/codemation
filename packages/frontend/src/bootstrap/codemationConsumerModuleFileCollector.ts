import { readdir } from "node:fs/promises";
import path from "node:path";

export class CodemationConsumerModuleFileCollector {
  async collect(rootDirectory: string): Promise<ReadonlyArray<string>> {
    return await this.collectRecursive(rootDirectory);
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
      if (this.isSupportedModuleFile(entryPath)) collected.push(entryPath);
    }
    return collected;
  }

  private isSupportedModuleFile(filePath: string): boolean {
    if (filePath.endsWith(".d.ts")) return false;
    if (filePath.endsWith(".test.ts") || filePath.endsWith(".spec.ts")) return false;
    return [".ts", ".tsx", ".js", ".mjs", ".mts"].some((extension) => filePath.endsWith(extension));
  }
}
