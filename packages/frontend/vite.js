import path from "node:path";
import viteReact from "@vitejs/plugin-react";
import viteTsconfigPaths from "vite-tsconfig-paths";

export class CodemationVitePlugin {
  static defaultWorkflowDirectories = ["src/workflows", "workflows"];

  constructor(options = {}) {
    this.options = options;
  }

  createConfig() {
    return {
      server: {
        proxy: {
          "/api": this.options.apiProxyTarget ?? "http://127.0.0.1:3000",
        },
      },
      plugins: [this.createFullReloadPlugin(), viteTsconfigPaths(), viteReact()],
    };
  }

  createFullReloadPlugin() {
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

  shouldTriggerFullReload(filePath, root) {
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

  resolveConfigPath(root) {
    return path.resolve(root, this.options.configPath ?? "./codemation.config.ts");
  }

  resolveWorkflowDirectories(root) {
    const workflowDirectories = this.options.workflowDirectories ?? [...CodemationVitePlugin.defaultWorkflowDirectories];
    return workflowDirectories.map((directory) => path.resolve(root, directory));
  }
}
