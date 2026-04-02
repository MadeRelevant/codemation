import { createWorkflowBuilder, ManualTrigger } from "@codemation/core-nodes";
import { definePlugin, SandboxFactory } from "@codemation/host";
import { exampleApiKeyCredentialType } from "./src/credentialTypes/ExampleApiKeyCredentialType";
import { ExamplePluginHttpDemo } from "./src/nodes/ExamplePluginHttpDemo";
import { ExamplePluginHttpDemoNode } from "./src/nodes/ExamplePluginHttpDemoNode";

const sandbox = SandboxFactory.create({
  productName: "Plugin sandbox",
  config: {
    workflows: [
      createWorkflowBuilder({ id: "wf.plugin.http", name: "Plugin HTTP demo" })
        .trigger(new ManualTrigger<Record<string, unknown>>("Start", [{ json: {} }]))
        .then(new ExamplePluginHttpDemo("Fetch demo"))
        .build(),
    ],
  },
});

const plugin = definePlugin({
  credentialTypes: [exampleApiKeyCredentialType],
  register: (context) => {
    context.registerNode(ExamplePluginHttpDemoNode);
  },
  sandbox,
});

export default plugin;
