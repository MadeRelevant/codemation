import { defineCodemationApp, definePlugin, workflow } from "@codemation/host";
import { exampleApiKeyCredentialType } from "./src/credentialTypes/ExampleApiKeyCredentialType";
import { examplePluginUppercaseNode } from "./src/nodes/ExamplePluginUppercase";

const plugin = definePlugin({
  credentials: [exampleApiKeyCredentialType],
  nodes: [examplePluginUppercaseNode],
  sandbox: defineCodemationApp({
    name: "Plugin sandbox",
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
      // Fluent DSL (`workflow` from `@codemation/host`); use `createWorkflowBuilder` for non-manual triggers.
      workflow("wf.plugin.hello")
        .name("Plugin Hello")
        .manualTrigger("Start", {
          message: "hello plugin",
        })
        .node(examplePluginUppercaseNode, { field: "message" }, "Uppercase message")
        .build(),
    ],
  }),
});

export default plugin;
