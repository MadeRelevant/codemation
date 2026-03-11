import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { StartRouteTemplateCatalog } from "@codemation/frontend/templates";
import type { CodemationResolvedPaths } from "./types";

export class CodemationStartRouteWriter {
  async sync(paths: CodemationResolvedPaths): Promise<void> {
    if (!(await this.shouldGenerate(paths.consumerRoot))) {
      return;
    }

    const routesDirectory = path.resolve(paths.consumerRoot, "src", "routes");
    await mkdir(routesDirectory, { recursive: true });

    await this.writeIfChanged(path.resolve(routesDirectory, "index.tsx"), StartRouteTemplateCatalog.createIndexRoute());
    await this.writeIfChanged(path.resolve(routesDirectory, "workflows.tsx"), StartRouteTemplateCatalog.createWorkflowsLayoutRoute());
    await this.writeIfChanged(path.resolve(routesDirectory, "workflows.index.tsx"), StartRouteTemplateCatalog.createWorkflowsIndexRoute());
    await this.writeIfChanged(path.resolve(routesDirectory, "workflows.$workflowId.tsx"), StartRouteTemplateCatalog.createWorkflowDetailRoute());
    await this.writeIfChanged(path.resolve(routesDirectory, "api.$.ts"), StartRouteTemplateCatalog.createApiRoute());
  }

  private async shouldGenerate(consumerRoot: string): Promise<boolean> {
    return (await this.exists(path.resolve(consumerRoot, "vite.config.ts"))) || (await this.exists(path.resolve(consumerRoot, "vite.config.mts")));
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
