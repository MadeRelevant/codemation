import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "codemation.plugin": "codemation.plugin.ts",
  },
  outDir: "dist",
  clean: true,
  dts: true,
  format: ["esm", "cjs"],
  sourcemap: true,
});
