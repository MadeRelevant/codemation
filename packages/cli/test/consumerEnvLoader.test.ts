import { writeFileSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { ConsumerEnvLoader } from "../src/consumer/ConsumerEnvLoader";

describe("ConsumerEnvLoader", () => {
  it("mergeIntoProcessEnvironment applies consumer keys and prefers shell DATABASE_URL and AUTH_SECRET", () => {
    const loader = new ConsumerEnvLoader();
    const merged = loader.mergeIntoProcessEnvironment(
      {
        DATABASE_URL: "postgresql://from-shell/db",
        SOME_OTHER: "keep",
      } as NodeJS.ProcessEnv,
      {
        DATABASE_URL: "postgresql://from-consumer/db",
        AUTH_SECRET: "from-consumer-auth",
        CODEMATION_GOOGLE_CLIENT_ID: "client-id-from-dotenv",
      },
    );
    expect(merged.DATABASE_URL).toBe("postgresql://from-shell/db");
    expect(merged.AUTH_SECRET).toBe("from-consumer-auth");
    expect(merged.CODEMATION_GOOGLE_CLIENT_ID).toBe("client-id-from-dotenv");
    expect(merged.SOME_OTHER).toBe("keep");
  });

  it("mergeConsumerRootIntoProcessEnvironment reads consumer .env into the merged snapshot", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "codemation-consumer-env-"));
    try {
      writeFileSync(
        path.join(dir, ".env"),
        ["CODEMATION_GOOGLE_CLIENT_ID=id-from-file", "DATABASE_URL=postgresql://from-file/db", ""].join("\n"),
        "utf8",
      );
      const loader = new ConsumerEnvLoader();
      const merged = loader.mergeConsumerRootIntoProcessEnvironment(dir, {} as NodeJS.ProcessEnv);
      expect(merged.CODEMATION_GOOGLE_CLIENT_ID).toBe("id-from-file");
      expect(merged.DATABASE_URL).toBe("postgresql://from-file/db");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("loads .env.local after .env so local wins on duplicate keys", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "codemation-consumer-env-local-"));
    try {
      writeFileSync(path.join(dir, ".env"), "FOO=from-env\n", "utf8");
      writeFileSync(path.join(dir, ".env.local"), "FOO=from-local\n", "utf8");
      const loader = new ConsumerEnvLoader();
      const merged = loader.load(dir);
      expect(merged.FOO).toBe("from-local");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("mergeIntoProcessEnvironment prefers shell AUTH_SECRET when set", () => {
    const loader = new ConsumerEnvLoader();
    const merged = loader.mergeIntoProcessEnvironment({ AUTH_SECRET: "shell-auth" } as NodeJS.ProcessEnv, {
      AUTH_SECRET: "file-auth",
    });
    expect(merged.AUTH_SECRET).toBe("shell-auth");
  });
});
