import { defineNode } from "@codemation/core";

export const pluginDevUppercaseNode = defineNode({
  key: "plugin-dev.uppercase",
  title: "Uppercase text",
  input: {
    field: "string",
  },
  run(
    items: ReadonlyArray<Readonly<{ message: string }>>,
    { config }: { readonly config: Readonly<{ field: string }> },
  ) {
    return items.map((item) => ({
      ...item,
      [config.field]: String(item[config.field as keyof typeof item] ?? "").toUpperCase(),
    }));
  },
});
