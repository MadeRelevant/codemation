import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { expect, test } from "vitest";

import { ConsumerEnvLoader } from "../src/consumer/ConsumerEnvLoader";
import { DevAuthSettingsLoader } from "../src/dev/DevAuthSettingsLoader";

class StubConfigLoader {
  async load(): Promise<
    Readonly<{ config: Readonly<{ auth?: Readonly<{ allowUnauthenticatedInDevelopment?: boolean }> }> }>
  > {
    return {
      config: {
        auth: {
          allowUnauthenticatedInDevelopment: true,
        },
      },
    };
  }
}

test("uses a stable development auth secret when none is configured", async () => {
  const savedAuthSecret = process.env.AUTH_SECRET;
  try {
    delete process.env.AUTH_SECRET;

    const loader = new DevAuthSettingsLoader(new StubConfigLoader() as never, new ConsumerEnvLoader());
    const resolved = await loader.loadForConsumer("/tmp/consumer");

    expect(resolved.authSecret).toBe(DevAuthSettingsLoader.defaultDevelopmentAuthSecret);
    expect(resolved.skipUiAuth).toBe(true);
  } finally {
    if (savedAuthSecret === undefined) {
      delete process.env.AUTH_SECRET;
    } else {
      process.env.AUTH_SECRET = savedAuthSecret;
    }
  }
});

test("prefers configured auth secrets over the development fallback", () => {
  const loader = new DevAuthSettingsLoader(new StubConfigLoader() as never, new ConsumerEnvLoader());

  expect(loader.resolveDevelopmentAuthSecret({ AUTH_SECRET: "from-auth-secret" })).toBe("from-auth-secret");
  expect(loader.resolveDevelopmentAuthSecret({})).toBe(DevAuthSettingsLoader.defaultDevelopmentAuthSecret);
});

test("loadForConsumer reads AUTH_SECRET from the consumer project .env", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "codemation-dev-auth-"));
  try {
    await writeFile(path.join(root, ".env"), "AUTH_SECRET=from-consumer-env\n", "utf8");

    const loader = new DevAuthSettingsLoader(new StubConfigLoader() as never, new ConsumerEnvLoader());
    const resolved = await loader.loadForConsumer(root);

    expect(resolved.authSecret).toBe("from-consumer-env");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
