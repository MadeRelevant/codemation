import { defineConfig } from "vite";
import { CodemationVitePlugin } from "@codemation/frontend/vite";

export default defineConfig(new CodemationVitePlugin().createConfig());
