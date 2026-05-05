import { defineCodemationApp, definePlugin } from "@codemation/host/authoring";
import { register } from "./src/plugin";

const sandbox = defineCodemationApp({
  name: "MS Graph plugin sandbox",
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
  // Dev workflows are discovered from the dev/ folder at runtime.
  workflowDiscovery: { directories: ["./dev/workflows"] },
});

const plugin = definePlugin({
  register,
  sandbox,
});

export default plugin;
