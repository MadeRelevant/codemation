import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GmailNodes, GmailNodeTokens } from "../../../core-nodes-gmail/src/index";
import { CodemationBootstrapRequest } from "../../src/bootstrap/CodemationBootstrapRequest";
import { CodemationApplication } from "../../src/codemationApplication";
import type { CodemationPlugin, CodemationPluginContext } from "../../src/presentation/config/CodemationPlugin";

class TestPluginTokenCatalog {
  static readonly value = Symbol.for("codemation.frontend.test.plugin-value");
}

class TestPlugin implements CodemationPlugin {
  async register(context: CodemationPluginContext): Promise<void> {
    context.container.registerInstance(TestPluginTokenCatalog.value, "registered-by-plugin");
  }
}

describe("Codemation plugins", () => {
  let originalRedisUrl: string | undefined;

  beforeEach(() => {
    originalRedisUrl = process.env.REDIS_URL;
    process.env.REDIS_URL = "redis://example.invalid";
  });

  afterEach(() => {
    if (originalRedisUrl === undefined) {
      delete process.env.REDIS_URL;
      return;
    }
    process.env.REDIS_URL = originalRedisUrl;
  });

  it("applies plugin registrations before runtime startup", async () => {
    const application = new CodemationApplication();
    application.useConfig({
      app: {
        database: {
          kind: "pglite",
        },
        scheduler: {
          kind: "inline",
        },
      },
      plugins: [new TestPlugin()],
    });

    await application.applyPlugins(
      new CodemationBootstrapRequest({
        consumerRoot: import.meta.dirname,
        repoRoot: import.meta.dirname,
        env: {},
      }),
    );

    expect(application.getContainer().resolve(TestPluginTokenCatalog.value)).toBe("registered-by-plugin");
  });

  it("lets the Gmail plugin self-register its runtime services", async () => {
    const application = new CodemationApplication();
    application.useConfig({
      app: {
        database: {
          kind: "pglite",
        },
        scheduler: {
          kind: "inline",
        },
      },
      plugins: [new GmailNodes()],
    });

    await application.applyPlugins(
      new CodemationBootstrapRequest({
        consumerRoot: import.meta.dirname,
        repoRoot: import.meta.dirname,
        env: {},
      }),
    );

    expect(application.getContainer().isRegistered(GmailNodeTokens.GmailApiClient, true)).toBe(true);
  });
});
