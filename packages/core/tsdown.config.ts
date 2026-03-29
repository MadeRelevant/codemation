import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/testing.ts", "src/bootstrap/index.ts"],
  outDir: "dist",
  clean: false,
  dts: true,
  format: ["esm", "cjs"],
  sourcemap: true,
});
