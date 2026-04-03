import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@codemation/agent-skills",
    root: import.meta.dirname,
    environment: "node",
    include: ["test/**/*.test.ts"],
    pool: "threads",
  },
});
