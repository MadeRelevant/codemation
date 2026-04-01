import { createWorkflowBuilder, ManualTrigger } from "@codemation/core-nodes";
import { definePlugin, type CodemationConfig } from "@codemation/host";

import { pluginDevApiKeyCredentialType } from "./src/credentialTypes/PluginDevApiKeyCredentialType";
import { PluginDevUppercase } from "./src/nodes/PluginDevUppercase";
import { PluginDevUppercaseNode } from "./src/nodes/PluginDevUppercaseNode";

type PluginDevSeedJson = Readonly<{
  message: string;
}>;

const sandbox: CodemationConfig = {
  app: {
    auth: {
      kind: "local",
      allowUnauthenticatedInDevelopment: true,
    },
    database: {
      kind: "pglite",
      pgliteDataDir: ".codemation/pglite",
    },
    scheduler: {
      kind: "inline",
    },
    whitelabel: {
      productName: "Plugin dev sandbox",
    },
  },
  workflows: [
    createWorkflowBuilder({ id: "wf.plugin-dev.hello", name: "Plugin Dev Hello" })
      .trigger(new ManualTrigger<PluginDevSeedJson>("Start", [{ json: { message: "hello plugin dev" } }]))
      .then(new PluginDevUppercase<PluginDevSeedJson, "message">("Uppercase message", { field: "message" }))
      .build(),
  ],
};

const plugin = definePlugin({
  credentialTypes: [pluginDevApiKeyCredentialType],
  register: (context) => {
    context.registerNode(PluginDevUppercaseNode);
  },
  sandbox,
});

export default plugin;
