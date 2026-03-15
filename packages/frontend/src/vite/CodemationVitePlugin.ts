import path from "node:path";
import viteReact from "@vitejs/plugin-react";
import type { Plugin, UserConfig } from "vite";
import viteTsconfigPaths from "vite-tsconfig-paths";

export interface CodemationVitePluginOptions {
  readonly apiProxyTarget?: string;
  readonly configPath?: string;
  readonly workflowDirectories?: ReadonlyArray<string>;
}

export class CodemationVitePlugin {
  private static readonly defaultWorkflowDirectories = ["src/workflows", "workflows"] as const;

  constructor(private readonly options: CodemationVitePluginOptions = {}) {}

  createConfig(): UserConfig {
    return {
      server: {
        proxy: {
          "/api": this.options.apiProxyTarget ?? "http://127.0.0.1:3000",
        },
      },
      plugins: [this.createFullReloadPlugin(), viteTsconfigPaths(), viteReact()],
    };
  }

  private createFullReloadPlugin(): Plugin {
    return {
      name: "codemation-full-reload",
      handleHotUpdate: ({ file, server }) => {
        const root = server.config.root ?? process.cwd();
        if (!this.shouldTriggerFullReload(file, root)) {
          return;
        }
        server.ws.send({ type: "full-reload", path: "*" });
      },
    };
  }

  private shouldTriggerFullReload(filePath: string, root: string): boolean {
    if (filePath === this.resolveConfigPath(root)) {
      return true;
    }
    for (const workflowDirectory of this.resolveWorkflowDirectories(root)) {
      if (filePath === workflowDirectory || filePath.startsWith(workflowDirectory + path.sep)) {
        return true;
      }
    }
    return false;
  }

  private resolveConfigPath(root: string): string {
    return path.resolve(root, this.options.configPath ?? "./codemation.config.ts");
  }

  private resolveWorkflowDirectories(root: string): ReadonlyArray<string> {
    const workflowDirectories = this.options.workflowDirectories ?? [...CodemationVitePlugin.defaultWorkflowDirectories];
    return workflowDirectories.map((directory) => path.resolve(root, directory));
  }
}
