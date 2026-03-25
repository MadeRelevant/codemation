import { readdir } from "node:fs/promises";
import path from "node:path";

export class WorkflowModulePathFinder {
  static readonly defaultWorkflowDirectories = ["src/workflows", "workflows"] as const;
  private readonly workflowExtensions = new Set([".ts", ".js", ".mts", ".mjs"]);

  async discoverModulePaths(
    args: Readonly<{
      consumerRoot: string;
      workflowDirectories: ReadonlyArray<string> | undefined;
      exists: (absolutePath: string) => Promise<boolean>;
    }>,
  ): Promise<ReadonlyArray<string>> {
    const directories = args.workflowDirectories ?? WorkflowModulePathFinder.defaultWorkflowDirectories;
    const workflowModulePaths: string[] = [];
    for (const directory of directories) {
      const absoluteDirectory = path.resolve(args.consumerRoot, directory);
      if (!(await args.exists(absoluteDirectory))) {
        continue;
      }
      workflowModulePaths.push(...(await this.collectWorkflowModulePaths(absoluteDirectory)));
    }
    return workflowModulePaths;
  }

  private async collectWorkflowModulePaths(directoryPath: string): Promise<ReadonlyArray<string>> {
    const entries = await readdir(directoryPath, { withFileTypes: true });
    const workflowModulePaths: string[] = [];
    for (const entry of entries) {
      const entryPath = path.resolve(directoryPath, entry.name);
      if (entry.isDirectory()) {
        workflowModulePaths.push(...(await this.collectWorkflowModulePaths(entryPath)));
        continue;
      }
      if (this.isWorkflowModulePath(entryPath)) {
        workflowModulePaths.push(entryPath);
      }
    }
    return workflowModulePaths;
  }

  private isWorkflowModulePath(modulePath: string): boolean {
    const extension = path.extname(modulePath);
    return this.workflowExtensions.has(extension) && !modulePath.endsWith(".d.ts");
  }
}
