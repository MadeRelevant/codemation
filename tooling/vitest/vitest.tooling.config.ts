import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "tooling",
    root: path.resolve(import.meta.dirname, ".."),
    environment: "node",
    include: ["test/**/*.test.ts"],
    pool: "threads",
    testTimeout: 120_000,
  },
});
