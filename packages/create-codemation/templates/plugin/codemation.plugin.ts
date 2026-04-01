import { createWorkflowBuilder, ManualTrigger } from "@codemation/core-nodes";
import { definePlugin, type CodemationConfig } from "@codemation/host";
import { exampleApiKeyCredentialType } from "./src/credentialTypes/ExampleApiKeyCredentialType";
import { ExamplePluginUppercase, ExamplePluginUppercaseNode } from "./src/nodes/ExamplePluginUppercase";

type SandboxSeedJson = Readonly<{
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
      productName: "Plugin sandbox",
    },
  },
  workflows: [
    createWorkflowBuilder({ id: "wf.plugin.hello", name: "Plugin Hello" })
      .trigger(new ManualTrigger<SandboxSeedJson>("Start", [{ json: { message: "hello plugin" } }]))
      .then(new ExamplePluginUppercase<SandboxSeedJson, "message">("Uppercase message", { field: "message" }))
      .build(),
  ],
};

const plugin = definePlugin({
  credentialTypes: [exampleApiKeyCredentialType],
  register: (context) => {
    context.registerNode(ExamplePluginUppercaseNode);
  },
  sandbox,
});

export default plugin;
