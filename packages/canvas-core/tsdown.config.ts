import { defineConfig } from "tsdown";

export default defineConfig({
  entry: "src/index.ts",
  outDir: "dist",
  clean: false,
  dts: true,
  format: ["esm", "cjs"],
  // canvas-core is consumed in both Node SSR and browser client bundles.
  // "neutral" tells the bundler NOT to inject node-only shims.
  platform: "neutral",
  sourcemap: true,
});
