import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@codemation/core-nodes",
    root: import.meta.dirname,
    environment: "node",
    include: ["test/**/*.test.ts"],
    pool: "threads",
    testTimeout: 120_000,
    coverage: {
      provider: "v8",
      // all:true ensures uncovered files contribute 0-hit lines so they cannot silently inflate %.
      all: true,
      include: ["src/**"],
      exclude: [
        // Pure re-export barrels — no runtime logic to test.
        "src/**/index.ts",
        "src/nodes/aiAgent.ts",
        // Type-only files — interfaces, type aliases, no runtime code.
        "src/**/*.types.ts",
        "src/register.types.ts",
        "src/chatModels/OpenAiCredentialSession.ts",
        "src/nodes/ToolLoadingStrategy.ts",
        "src/canvasIconName.ts",
        // Declaration files — no runtime code.
        "src/**/*.d.ts",
      ],
      thresholds: {
        lines: 90,
        functions: 85,
        branches: 65,
      },
    },
  },
  resolve: {
    conditions: ["development", "import", "module", "default"],
  },
});
