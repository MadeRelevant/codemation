import path from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

const prismaConfigPath = path.resolve(import.meta.dirname, "..", "prisma.config.ts");
const originalDatabaseUrl = process.env.DATABASE_URL;
let importCounter = 0;

class PrismaConfigTestLoader {
  async load(databaseUrl: string | undefined): Promise<{ datasource: { url: string } }> {
    if (databaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = databaseUrl;
    }
    const moduleUrl = `${pathToFileURL(prismaConfigPath).href}?case=${(importCounter += 1)}`;
    const imported = (await import(moduleUrl)) as { default: { datasource: { url: string } } };
    return imported.default;
  }
}

afterEach(() => {
  if (originalDatabaseUrl === undefined) {
    delete process.env.DATABASE_URL;
    return;
  }
  process.env.DATABASE_URL = originalDatabaseUrl;
});

describe("prisma config", () => {
  it("falls back to a schema-compatible placeholder URL when DATABASE_URL is absent", async () => {
    const config = await new PrismaConfigTestLoader().load(undefined);

    expect(config.datasource.url).toBe("postgresql://codemation:codemation@127.0.0.1:5432/codemation");
  });

  it("prefers DATABASE_URL when it is provided", async () => {
    const config = await new PrismaConfigTestLoader().load("postgresql://postgres:postgres@127.0.0.1:5432/real");

    expect(config.datasource.url).toBe("postgresql://postgres:postgres@127.0.0.1:5432/real");
  });
});
