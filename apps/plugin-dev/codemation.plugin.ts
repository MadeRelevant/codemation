import { createWorkflowBuilder, ManualTrigger } from "@codemation/core-nodes";
import { CodemationPluginContext, definePlugin, SandboxFactory } from "@codemation/host/plugin";

import { pluginDevApiKeyCredentialType } from "./src/credentialTypes/PluginDevApiKeyCredentialType";
import { PluginDevHttpDemo } from "./src/nodes/PluginDevHttpDemo";
import { PluginDevHttpDemoNode } from "./src/nodes/PluginDevHttpDemoNode";

const sandbox = SandboxFactory.create({
  productName: "Plugin dev sandbox",
  config: {
    workflows: [
      createWorkflowBuilder({ id: "wf.plugin-dev.http", name: "Plugin dev HTTP demo" })
        .trigger(new ManualTrigger<Record<string, unknown>>("Start", [{ json: {} }]))
        .then(new PluginDevHttpDemo("Fetch demo"))
        .build(),
    ],
  },
});

const plugin = definePlugin({
  credentialTypes: [pluginDevApiKeyCredentialType],
  register: (context: CodemationPluginContext) => {
    context.registerNode(PluginDevHttpDemoNode);
  },
  sandbox,
});

export default plugin;
