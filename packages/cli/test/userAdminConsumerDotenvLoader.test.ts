import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vitest";

import { UserAdminConsumerDotenvLoader } from "../src/user/UserAdminConsumerDotenvLoader";

test("consumer .env DATABASE_URL overrides an existing process.env value", async () => {
  const savedDatabaseUrl = process.env.DATABASE_URL;
  try {
    process.env.DATABASE_URL = "postgres://from-shell/test";

    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "codemation-cli-dotenv-"));
    try {
      await mkdir(tempRoot, { recursive: true });
      await writeFile(path.join(tempRoot, ".env"), "DATABASE_URL=postgres://from-consumer-file/test\n", "utf8");

      new UserAdminConsumerDotenvLoader().load(tempRoot);

      expect(process.env.DATABASE_URL).toBe("postgres://from-consumer-file/test");
    } finally {
      await rm(tempRoot, { force: true, recursive: true }).catch(() => null);
    }
  } finally {
    if (savedDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = savedDatabaseUrl;
    }
  }
});
