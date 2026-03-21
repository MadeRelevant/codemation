import { describe,expect,it } from "vitest";
import { GmailNodes,GmailNodeTokens } from "../../core-nodes-gmail/src/index";
import { CodemationApplication } from "../src/codemationApplication";
import type { CodemationPlugin,CodemationPluginContext } from "../src/presentation/config/CodemationPlugin";

class TestPluginTokenCatalog {
  static readonly value = Symbol.for("codemation.frontend.test.plugin-value");
}

class TestPlugin implements CodemationPlugin {
  async register(context: CodemationPluginContext): Promise<void> {
    context.container.registerInstance(TestPluginTokenCatalog.value, "registered-by-plugin");
  }
}

describe("Codemation plugins", () => {
  it("applies plugin registrations before runtime startup", async () => {
    const application = new CodemationApplication();
    application.useConfig({
      plugins: [new TestPlugin()],
    });

    await application.applyPlugins({
      consumerRoot: import.meta.dirname,
      repoRoot: import.meta.dirname,
      env: {},
    });

    expect(application.getContainer().resolve(TestPluginTokenCatalog.value)).toBe("registered-by-plugin");
  });

  it("lets the Gmail plugin self-register its runtime services", async () => {
    const application = new CodemationApplication();
    application.useConfig({
      plugins: [new GmailNodes()],
    });

    await application.applyPlugins({
      consumerRoot: import.meta.dirname,
      repoRoot: import.meta.dirname,
      env: {},
    });

    expect(application.getContainer().isRegistered(GmailNodeTokens.GmailApiClient, true)).toBe(true);
    expect(application.getContainer().isRegistered(GmailNodeTokens.GmailPubSubPullClient, true)).toBe(true);
  });
});
