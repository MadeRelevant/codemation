import { definePlugin, type CodemationConfig } from "@codemation/host";
import { GmailNodes } from "./src/plugin/GmailNodesRegistry";

const sandbox: CodemationConfig = {
  app: {
    auth: {
      kind: "local",
      allowUnauthenticatedInDevelopment: true,
    },
    database: {
      kind: "sqlite",
      sqliteFilePath: ".codemation/codemation.sqlite",
    },
    scheduler: {
      kind: "inline",
    },
    whitelabel: {
      productName: "Gmail plugin sandbox",
    },
  },
};

const plugin = definePlugin({
  register: async (context) => {
    await new GmailNodes().register(context);
  },
  sandbox,
});

export default plugin;
