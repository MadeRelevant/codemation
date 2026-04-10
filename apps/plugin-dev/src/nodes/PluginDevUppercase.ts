import { defineNode } from "@codemation/core";

export const pluginDevUppercaseNode = defineNode({
  key: "plugin-dev.uppercase",
  title: "Uppercase text",
  input: {
    field: "string",
  },
  execute(
    { input }: { readonly input: Readonly<{ message: string }> },
    { config }: { readonly config: Readonly<{ field: string }> },
  ) {
    return {
      ...input,
      [config.field]: String(input[config.field as keyof typeof input] ?? "").toUpperCase(),
    };
  },
});
