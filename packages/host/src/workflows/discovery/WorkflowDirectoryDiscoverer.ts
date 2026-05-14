import type { WorkflowDefinition } from "@codemation/core";
import { readdir } from "node:fs/promises";
import path from "node:path";

/**
 * Callable that imports a module from an absolute path and returns its exports.
 * Injectable for testability — production callers use a dynamic `import()`.
 */
export type WorkflowModuleImporter = (absolutePath: string) => Promise<Readonly<Record<string, unknown>>>;

/**
 * Walks a directory recursively, imports every `*.ts` / `*.tsx` file
 * (excluding `*.test.*` and `*.d.ts`), and returns all exported {@link WorkflowDefinition}
 * values, deduplicated by id.
 */
export class WorkflowDirectoryDiscoverer {
  constructor(private readonly importer: WorkflowModuleImporter) {}

  async discover(
    args: Readonly<{ consumerRoot: string; workflowsDir: string }>,
  ): Promise<ReadonlyArray<WorkflowDefinition>> {
    const absoluteDir = path.resolve(args.consumerRoot, args.workflowsDir);
    const filePaths = await this.collectFilePaths(absoluteDir);
    const workflowsById = new Map<string, WorkflowDefinition>();
    for (const filePath of filePaths) {
      const moduleExports = await this.importer(filePath);
      for (const exported of Object.values(moduleExports)) {
        if (this.isWorkflowDefinition(exported)) {
          workflowsById.set(exported.id, exported);
        }
      }
    }
    return [...workflowsById.values()];
  }

  private async collectFilePaths(absoluteDir: string): Promise<ReadonlyArray<string>> {
    let entries;
    try {
      entries = await readdir(absoluteDir, { withFileTypes: true });
    } catch {
      return [];
    }
    const filePaths: string[] = [];
    for (const entry of entries) {
      const entryPath = path.join(absoluteDir, entry.name);
      if (entry.isDirectory()) {
        filePaths.push(...(await this.collectFilePaths(entryPath)));
        continue;
      }
      if (this.isDiscoverableFile(entry.name)) {
        filePaths.push(entryPath);
      }
    }
    return filePaths;
  }

  private isDiscoverableFile(filename: string): boolean {
    const ext = path.extname(filename);
    if (ext !== ".ts" && ext !== ".tsx") {
      return false;
    }
    if (filename.endsWith(".d.ts")) {
      return false;
    }
    // Exclude test files: *.test.ts, *.test.tsx, *.spec.ts, *.spec.tsx, etc.
    const withoutExt = filename.slice(0, -ext.length);
    if (withoutExt.endsWith(".test") || withoutExt.endsWith(".spec")) {
      return false;
    }
    return true;
  }

  private isWorkflowDefinition(value: unknown): value is WorkflowDefinition {
    if (!value || typeof value !== "object") {
      return false;
    }
    return "id" in value && "name" in value && "nodes" in value && "edges" in value;
  }
}
