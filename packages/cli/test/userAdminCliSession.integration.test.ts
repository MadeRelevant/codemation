// @vitest-environment node

import "reflect-metadata";

import { ListUserAccountsQuery } from "@codemation/host";
import { CodemationConsumerConfigLoader } from "@codemation/host/server";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

import { CodemationCliApplicationSession } from "../src/bootstrap/CodemationCliApplicationSession";
import type { IntegrationDatabase } from "../../host/test/http/testkit/IntegrationDatabaseFactory";
import { IntegrationDatabaseFactory } from "../../host/test/http/testkit/IntegrationDatabaseFactory";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const integrationSandboxRoot = path.join(repoRoot, "packages/cli/test/integration-sandbox");

function minimalWorkflowSource(): string {
  return `export default {
  id: "wf.cli.session.integration",
  name: "CLI session integration",
  nodes: [],
  edges: [],
};
`;
}

it(
  "loads transpiled consumer config and opens a CodemationCliApplicationSession without errors",
  { timeout: 180_000 },
  async () => {
    let database: IntegrationDatabase | null = null;
    let consumerRoot: string | null = null;
    try {
      database = await IntegrationDatabaseFactory.create();
      await mkdir(integrationSandboxRoot, { recursive: true });
      consumerRoot = await mkdtemp(path.join(integrationSandboxRoot, "consumer-"));
      const databaseUrl = database.databaseUrl;
      process.env.CODEMATION_TSCONFIG_PATH = path.join(repoRoot, "tsconfig.codemation-tsx.json");

      const configSource = `export default {
  auth: { kind: "local" },
  workflowDiscovery: { directories: ["src/workflows"] },
  runtime: {
    database: { kind: "postgresql", url: ${JSON.stringify(databaseUrl)} },
    eventBus: { kind: "memory" },
    scheduler: { kind: "local" },
  },
};
`;
      await writeFile(path.join(consumerRoot, "codemation.config.ts"), configSource, "utf8");
      await mkdir(path.join(consumerRoot, "src", "workflows"), { recursive: true });
      await writeFile(path.join(consumerRoot, "src", "workflows", "fixture.ts"), minimalWorkflowSource(), "utf8");

      const loader = new CodemationConsumerConfigLoader();
      const resolution = await loader.load({ consumerRoot });
      expect(resolution.config.auth?.kind).toBe("local");

      // Consumer under /tmp would not resolve a workspace root; persistence needs the real monorepo root.
      const session = await CodemationCliApplicationSession.open({
        resolution,
        repoRoot,
        consumerRoot,
        env: { ...process.env },
      });
      try {
        const users = await session.getQueryBus().execute(new ListUserAccountsQuery());
        expect(Array.isArray(users)).toBe(true);
      } finally {
        await session.close();
      }
    } finally {
      if (consumerRoot) {
        await rm(consumerRoot, { force: true, recursive: true }).catch(() => null);
      }
      if (database) {
        await database.close();
      }
    }
  },
);
