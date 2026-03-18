import { defineConfig } from "tsdown";

export default defineConfig({
  entry: "src/index.ts",
  outDir: "dist",
  clean: false,
  dts: true,
  format: ["esm", "cjs"],
});
