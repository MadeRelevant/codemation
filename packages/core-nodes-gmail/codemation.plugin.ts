import { definePlugin, SandboxFactory } from "@codemation/host";
import { GmailNodes } from "./src/plugin/GmailNodesRegistry";

const sandbox = SandboxFactory.create({
  productName: "Gmail plugin sandbox",
});

const plugin = definePlugin({
  register: async (context) => {
    await new GmailNodes().register(context);
  },
  sandbox,
});

export default plugin;
