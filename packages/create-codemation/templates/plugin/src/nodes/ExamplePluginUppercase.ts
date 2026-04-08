import { defineNode } from "@codemation/core";

export const examplePluginUppercaseNode = defineNode({
  key: "example-plugin.uppercase",
  title: "Uppercase text",
  icon: "lucide:languages",
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
