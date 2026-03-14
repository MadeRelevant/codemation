import { defineConfig } from "vite";
import path from "node:path";
import viteTsconfigPaths from "vite-tsconfig-paths";
import viteReact from "@vitejs/plugin-react";

export default defineConfig({
  server: {
    proxy: {
      "/api": "http://127.0.0.1:3000",
    },
  },
  plugins: [
    {
      name: "codemation-full-reload",
      handleHotUpdate({ file, server }) {
        const root = server.config.root ?? process.cwd();
        const configPath = path.resolve(root, "codemation.config.ts");
        const srcWorkflowsDir = path.resolve(root, "src", "workflows");
        const workflowsDir = path.resolve(root, "workflows");
        const isConfigChange = file === configPath;
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
    viteTsconfigPaths(),
    viteReact(),
  ],
});
