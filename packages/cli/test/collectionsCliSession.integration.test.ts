// @vitest-environment node

import "reflect-metadata";

import {
  InsertCollectionRowCommand,
  ListCollectionsQuery,
  GetCollectionRowQuery,
  UpdateCollectionRowCommand,
  DeleteCollectionRowCommand,
} from "@codemation/host";
import { AppConfigLoader } from "@codemation/host/server";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

import { CodemationCliApplicationSession } from "../src/bootstrap/CodemationCliApplicationSession";
import type { IntegrationDatabase } from "../../host/test/http/testkit/IntegrationDatabaseFactory";
import { IntegrationDatabaseFactory } from "../../host/test/http/testkit/IntegrationDatabaseFactory";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const integrationSandboxRoot = path.join(repoRoot, "packages/cli/test/integration-sandbox");

// Hardcodes runtime.database.kind = "postgresql"; skip when DATABASE_URL points at SQLite.
it.skipIf(process.env.DATABASE_URL?.startsWith("file:"))(
  "collections CLI: insert → list → get → update → delete cycle",
  { timeout: 180_000 },
  async () => {
    let database: IntegrationDatabase | null = null;
    let consumerRoot: string | null = null;
    try {
      database = await IntegrationDatabaseFactory.create();
      await mkdir(integrationSandboxRoot, { recursive: true });
      consumerRoot = await mkdtemp(path.join(integrationSandboxRoot, "collections-cli-"));
      const databaseUrl = database.databaseUrl;
      process.env.CODEMATION_TSCONFIG_PATH = path.join(repoRoot, "tsconfig.codemation-tsx.json");

      const configSource = `
import { defineCollection, c } from "@codemation/core";

export const messagesCollection = defineCollection({
  name: "messages_cli_test",
  fields: {
    sender_email: c.text().notNull(),
    body: c.text().notNull(),
  },
});

export default {
  auth: { kind: "local" },
  workflowDiscovery: { directories: ["src/workflows"] },
  runtime: {
    database: { kind: "postgresql", url: ${JSON.stringify(databaseUrl)} },
    eventBus: { kind: "memory" },
    scheduler: { kind: "local" },
  },
  collections: [messagesCollection],
};
`;
      await writeFile(path.join(consumerRoot, "codemation.config.ts"), configSource, "utf8");
      await mkdir(path.join(consumerRoot, "src", "workflows"), { recursive: true });

      const loader = new AppConfigLoader();
      const resolution = await loader.load({
        consumerRoot,
        repoRoot,
        env: { ...process.env },
      });

      const session = await CodemationCliApplicationSession.open({
        appConfig: resolution.appConfig,
      });
      try {
        // List collections — should contain our test collection
        const collections = await session.getQueryBus().execute(new ListCollectionsQuery());
        const testCol = collections.find((c) => c.name === "messages_cli_test");
        expect(testCol).toBeDefined();
        expect(testCol?.fieldCount).toBeGreaterThanOrEqual(2);

        // Insert a row
        const inserted = await session
          .getCommandBus()
          .execute(
            new InsertCollectionRowCommand("messages_cli_test", { sender_email: "test@example.com", body: "Hello" }),
          );
        expect(inserted.id).toBeTruthy();
        expect(inserted.data).toMatchObject({ sender_email: "test@example.com", body: "Hello" });

        // Get by ID
        const fetched = await session
          .getQueryBus()
          .execute(new GetCollectionRowQuery("messages_cli_test", inserted.id));
        expect(fetched?.id).toBe(inserted.id);
        expect(fetched?.data).toMatchObject({ sender_email: "test@example.com" });

        // Update
        const updated = await session
          .getCommandBus()
          .execute(new UpdateCollectionRowCommand("messages_cli_test", inserted.id, { body: "Updated" }));
        expect(updated.data).toMatchObject({ body: "Updated" });

        // Delete
        const deleted = await session
          .getCommandBus()
          .execute(new DeleteCollectionRowCommand("messages_cli_test", inserted.id));
        expect(deleted.deleted).toBe(true);

        // Confirm deletion
        const notFound = await session
          .getQueryBus()
          .execute(new GetCollectionRowQuery("messages_cli_test", inserted.id));
        expect(notFound).toBeNull();
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
