import { expect, test } from "vitest";

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
  const savedNextAuthSecret = process.env.NEXTAUTH_SECRET;
  try {
    delete process.env.AUTH_SECRET;
    delete process.env.NEXTAUTH_SECRET;

    const loader = new DevAuthSettingsLoader(new StubConfigLoader() as never);
    const resolved = await loader.loadForConsumer("/tmp/consumer");

    expect(resolved.authSecret).toBe(DevAuthSettingsLoader.defaultDevelopmentAuthSecret);
    expect(resolved.skipUiAuth).toBe(true);
  } finally {
    if (savedAuthSecret === undefined) {
      delete process.env.AUTH_SECRET;
    } else {
      process.env.AUTH_SECRET = savedAuthSecret;
    }
    if (savedNextAuthSecret === undefined) {
      delete process.env.NEXTAUTH_SECRET;
    } else {
      process.env.NEXTAUTH_SECRET = savedNextAuthSecret;
    }
  }
});

test("prefers configured auth secrets over the development fallback", () => {
  const loader = new DevAuthSettingsLoader(new StubConfigLoader() as never);

  expect(loader.resolveDevelopmentAuthSecret({ AUTH_SECRET: "from-auth-secret" })).toBe("from-auth-secret");
  expect(loader.resolveDevelopmentAuthSecret({ NEXTAUTH_SECRET: "from-nextauth-secret" })).toBe("from-nextauth-secret");
});
