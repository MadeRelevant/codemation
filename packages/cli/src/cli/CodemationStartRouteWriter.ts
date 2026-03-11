import { access, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { StartRouteTemplateCatalog } from "@codemation/frontend/templates";
import type { CodemationResolvedPaths } from "./types";

export class CodemationStartRouteWriter {
  async sync(paths: CodemationResolvedPaths): Promise<void> {
    if (!(await this.shouldGenerate(paths.consumerRoot))) {
      return;
    }

    const routesDirectory = path.resolve(paths.consumerRoot, "src", "routes");
    const generatedRoutesDirectory = path.resolve(
      routesDirectory,
      StartRouteTemplateCatalog.getGeneratedRoutesDirectoryName(),
    );
    await mkdir(generatedRoutesDirectory, { recursive: true });
    await this.removeLegacyGeneratedRoutes(routesDirectory);

    for (const template of StartRouteTemplateCatalog.getTemplates()) {
      await this.writeIfChanged(path.resolve(generatedRoutesDirectory, template.fileName), template.source);
    }
  }

  private async shouldGenerate(consumerRoot: string): Promise<boolean> {
    return (await this.exists(path.resolve(consumerRoot, "vite.config.ts"))) || (await this.exists(path.resolve(consumerRoot, "vite.config.mts")));
  }

  private async removeLegacyGeneratedRoutes(routesDirectory: string): Promise<void> {
    for (const fileName of StartRouteTemplateCatalog.getLegacyRootRouteFileNames()) {
      const targetPath = path.resolve(routesDirectory, fileName);
      const currentContent = await this.readExisting(targetPath);
      if (currentContent === null || !StartRouteTemplateCatalog.isGeneratedRouteContent(currentContent)) {
        continue;
      }
      await unlink(targetPath);
    }
  }

  private async writeIfChanged(targetPath: string, nextContent: string): Promise<void> {
    const currentContent = await this.readExisting(targetPath);
    if (currentContent === nextContent) {
      return;
    }
    await writeFile(targetPath, nextContent, "utf8");
  }

  private async readExisting(targetPath: string): Promise<string | null> {
    try {
      return await readFile(targetPath, "utf8");
    } catch {
      return null;
    }
  }

  private async exists(targetPath: string): Promise<boolean> {
    try {
      await access(targetPath);
      return true;
    } catch {
      return false;
    }
  }
}
