import { defineNode } from "@codemation/core";

export const examplePluginUppercaseNode = defineNode({
  key: "example-plugin.uppercase",
  title: "Uppercase text",
  icon: "lucide:languages",
  input: {
    field: "string",
  },
  execute({ input }, { config }) {
    return {
      ...input,
      [config.field]: String(input[config.field as keyof typeof input] ?? "").toUpperCase(),
    };
  },
});
