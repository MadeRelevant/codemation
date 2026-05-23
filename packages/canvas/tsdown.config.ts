import { defineConfig } from "tsdown";

export default defineConfig({
  entry: "src/index.ts",
  outDir: "dist",
  clean: false,
  dts: true,
  format: ["esm", "cjs"],
  // Canvas is consumed in both Node SSR and browser client bundles.
  // "neutral" tells the bundler NOT to inject node-only shims like
  // `createRequire` from `node:module` into the output — those break consumer
  // bundlers (Turbopack/webpack) when the chunk is loaded into a client
  // component, since `node:module` cannot be resolved in browser contexts.
  // Pure ESM with no node-specific glue.
  platform: "neutral",
  sourcemap: true,
});
