import { defineCodemationApp, definePlugin, workflow } from "@codemation/host";

import { pluginDevApiKeyCredentialType } from "./src/credentialTypes/PluginDevApiKeyCredentialType";
import { pluginDevUppercaseNode } from "./src/nodes/PluginDevUppercase";

const plugin = definePlugin({
  credentials: [pluginDevApiKeyCredentialType],
  nodes: [pluginDevUppercaseNode],
  sandbox: defineCodemationApp({
    name: "Plugin dev sandbox",
    auth: {
      kind: "local",
      allowUnauthenticatedInDevelopment: true,
    },
    database: {
      kind: "sqlite",
      filePath: ".codemation/codemation.sqlite",
    },
    execution: {
      mode: "inline",
    },
    workflows: [
      workflow("wf.plugin-dev.hello")
        .name("Plugin Dev Hello")
        .manualTrigger("Start", {
          message: "hello plugin dev",
        })
        .node(pluginDevUppercaseNode, { field: "message" }, "Uppercase message")
        .build(),
    ],
  }),
});

export default plugin;
