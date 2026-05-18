import type { CodemationAppContext, CodemationConfig } from "@codemation/host";

/**
 * Dev harness config for @codemation/examples.
 * Discovers all .example.ts files so authors can run `pnpm dev` and
 * iterate on examples with the same dev loop a real consumer uses.
 */
export const codemationHost = {
  app: {
    auth: {
      kind: "local" as const,
      allowUnauthenticatedInDevelopment: true,
    },
    database: {
      kind: "sqlite" as const,
      sqliteFilePath: ".codemation/codemation.sqlite",
    },
    scheduler: {
      kind: "inline" as const,
    },
  },
  register(app: CodemationAppContext) {
    app.discoverWorkflows("src/examples");
  },
} satisfies CodemationConfig;

export default codemationHost;
