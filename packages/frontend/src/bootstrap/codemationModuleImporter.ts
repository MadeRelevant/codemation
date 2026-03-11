import { access, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { NamespacedUnregister } from "tsx/esm/api";
import { register } from "tsx/esm/api";

export class CodemationModuleImporter {
  private static readonly importerRegistrationsByTsconfig = new Map<string, NamespacedUnregister>();

  async importModule(modulePath: string): Promise<Record<string, unknown>> {
    const tsconfigPath = await this.resolveTsconfigPath(modulePath);
    const importedModule = await this.getOrCreateImporter(tsconfigPath).import(await this.createImportSpecifier(modulePath), import.meta.url);
    return importedModule as Record<string, unknown>;
  }

  private async resolveTsconfigPath(modulePath: string): Promise<string | false> {
    const discovered = await this.findNearestTsconfig(modulePath);
    return discovered ?? false;
  }

  private getOrCreateImporter(tsconfigPath: string | false): NamespacedUnregister {
    const cacheKey = tsconfigPath || "default";
    const existingImporter = CodemationModuleImporter.importerRegistrationsByTsconfig.get(cacheKey);
    if (existingImporter) return existingImporter;
    const nextImporter = register({
      namespace: this.toNamespace(cacheKey),
      tsconfig: tsconfigPath,
    });
    CodemationModuleImporter.importerRegistrationsByTsconfig.set(cacheKey, nextImporter);
    return nextImporter;
  }

  private toNamespace(cacheKey: string): string {
    return `codemation_${cacheKey.replace(/[^a-zA-Z0-9_-]+/g, "_")}`;
  }

  private async findNearestTsconfig(modulePath: string): Promise<string | null> {
    let currentDirectory = path.dirname(modulePath);
    while (true) {
      const candidate = path.resolve(currentDirectory, "tsconfig.json");
      if (await this.exists(candidate)) return candidate;
      const parentDirectory = path.dirname(currentDirectory);
      if (parentDirectory === currentDirectory) return null;
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

  private async createImportSpecifier(modulePath: string): Promise<string> {
    const moduleUrl = pathToFileURL(modulePath);
    const moduleStats = await stat(modulePath);
    moduleUrl.searchParams.set("t", String(moduleStats.mtimeMs));
    return moduleUrl.href;
  }
}
