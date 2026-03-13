import { defineConfig } from "vite";
import viteTsconfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { codemationStartPlugin } from "@codemation/start-plugin";

export default defineConfig({
  plugins: [
    codemationStartPlugin({ configPath: "./codemation.config.ts" }),
    viteTsconfigPaths(),
    tanstackStart(),
    viteReact(),
  ],
});
