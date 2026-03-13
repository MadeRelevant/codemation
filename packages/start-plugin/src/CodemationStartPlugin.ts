import path from "node:path";
import type { Plugin } from "vite";
import { CodemationRouteGenerator } from "./CodemationRouteGenerator";

const VIRTUAL_CONFIG_ID = "virtual:codemation/config";
const RESOLVED_CONFIG_ID = "\0" + VIRTUAL_CONFIG_ID;

export interface CodemationStartPluginOptions {
  configPath?: string;
}

export function codemationStartPlugin(options: CodemationStartPluginOptions = {}): Plugin[] {
  const configPath = options.configPath ?? "./codemation.config.ts";
  let projectRoot: string = process.cwd();

  return [
    {
      name: "codemation-start:virtual-modules",
      enforce: "pre",
      configResolved(config) {
        projectRoot = config.root ?? process.cwd();
      },
      resolveId(id: string) {
        if (id === VIRTUAL_CONFIG_ID) {
          return RESOLVED_CONFIG_ID;
        }
        return null;
      },
      load(id: string) {
        if (id !== RESOLVED_CONFIG_ID) {
          return null;
        }
        const resolvedPath = path.resolve(projectRoot, configPath);
        return `export { default as codemationConfig } from "${resolvedPath}";
export { default } from "${resolvedPath}";`;
      },
    },
    {
      name: "codemation-start:generate-routes",
      enforce: "pre",
      async configResolved(config) {
        const root = config.root ?? process.cwd();
        const srcDir = path.resolve(root, "src");
        const routesDir = path.resolve(srcDir, "routes");
        const resolvedConfigPath = path.resolve(root, configPath);

        const generator = new CodemationRouteGenerator(routesDir, resolvedConfigPath);
        await generator.sync();
      },
      handleHotUpdate({ file, server }) {
        const root = server.config.root ?? process.cwd();
        const configPathResolved = path.resolve(root, configPath);
        const srcWorkflowsDir = path.resolve(root, "src", "workflows");
        const workflowsDir = path.resolve(root, "workflows");
        const isConfigChange = file === configPathResolved;
        const isWorkflowSourceChange =
          file.startsWith(srcWorkflowsDir + path.sep) ||
          file === srcWorkflowsDir ||
          file.startsWith(workflowsDir + path.sep) ||
          file === workflowsDir;
        if (isConfigChange || isWorkflowSourceChange) {
          server.ws.send({ type: "full-reload", path: "*" });
        }
      },
    },
  ];
}
