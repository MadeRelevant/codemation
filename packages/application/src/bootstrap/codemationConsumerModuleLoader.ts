import type { Container } from "@codemation/core";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { CodemationConsumerClassRegistrar } from "./codemationConsumerClassRegistrar";
import { CodemationFileExistenceChecker } from "./codemationFileExistenceChecker";
import { CodemationModuleImporter } from "./codemationModuleImporter";

export class CodemationConsumerModuleLoader {
  private readonly defaultConsumerModuleRoots = ["src"] as const;
  private readonly consumerClassRegistrar = new CodemationConsumerClassRegistrar();
  private readonly fileExistenceChecker = new CodemationFileExistenceChecker();
  private readonly moduleImporter = new CodemationModuleImporter();

  async load(args: Readonly<{
    container: Container;
    consumerRoot: string;
    workflowSources: ReadonlyArray<string>;
    bootstrapSource: string | null;
    consumerModuleRoots?: ReadonlyArray<string>;
  }>): Promise<void> {
    const ignoredSources = new Set(args.workflowSources.map((entry) => path.resolve(entry)));
    if (args.bootstrapSource) ignoredSources.add(path.resolve(args.bootstrapSource));
    for (const moduleRoot of this.resolveConsumerModuleRoots(args.consumerModuleRoots)) {
      const resolvedRoot = path.resolve(args.consumerRoot, moduleRoot);
      if (!(await this.fileExistenceChecker.exists(resolvedRoot))) continue;
      for (const modulePath of await this.collectImportableModules(resolvedRoot)) {
        if (ignoredSources.has(modulePath)) continue;
        const importedModule = await this.moduleImporter.importModule(modulePath);
        this.consumerClassRegistrar.registerModuleExports({
          container: args.container,
          moduleExports: importedModule,
        });
      }
    }
  }

  private resolveConsumerModuleRoots(consumerModuleRoots: ReadonlyArray<string> | undefined): ReadonlyArray<string> {
    if (!consumerModuleRoots || consumerModuleRoots.length === 0) return this.defaultConsumerModuleRoots;
    return consumerModuleRoots;
  }

  private async collectImportableModules(targetPath: string): Promise<ReadonlyArray<string>> {
    const targetStats = await stat(targetPath);
    if (!targetStats.isDirectory()) return this.isImportableSourceFile(targetPath) ? [targetPath] : [];
    return await this.collectImportableModulesFromDirectory(targetPath);
  }

  private async collectImportableModulesFromDirectory(targetDirectory: string): Promise<ReadonlyArray<string>> {
    const entries = await readdir(targetDirectory, { withFileTypes: true });
    const collected: string[] = [];
    for (const entry of entries) {
      const resolvedPath = path.resolve(targetDirectory, entry.name);
      if (entry.isDirectory()) {
        collected.push(...(await this.collectImportableModulesFromDirectory(resolvedPath)));
        continue;
      }
      if (this.isImportableSourceFile(resolvedPath)) collected.push(resolvedPath);
    }
    return collected;
  }

  private isImportableSourceFile(filePath: string): boolean {
    if (filePath.endsWith(".d.ts")) return false;
    if (filePath.endsWith(".test.ts") || filePath.endsWith(".spec.ts")) return false;
    return [".ts", ".tsx", ".js", ".mjs", ".mts"].some((extension) => filePath.endsWith(extension));
  }
}
