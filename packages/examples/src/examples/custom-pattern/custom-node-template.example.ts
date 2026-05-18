/**
 * @description Define a fully custom node with per-item execute() logic using defineNode.
 * Use defineNode when the task isn't a REST call — arbitrary computation, data transformation,
 * business logic, or anything that doesn't map to a single HTTP endpoint.
 * This example normalizes a text field: trims whitespace and lowercases it.
 * @tags defineNode custom-node custom-logic extend per-item execute escape-hatch style:node
 * @uses defineNode, node:normalizeTextField
 * @dependencies @codemation/core@workspace:*
 */

import { workflow } from "@codemation/host";
import { defineNode } from "@codemation/core";

// ----- Step 1: Define the custom node -----
//
// defineNode gives you the full per-item execute() contract.
// Use it for: data transformation, business rules, collection reads/writes, third-party SDKs,
// anything that doesn't fit the REST pattern of defineRestNode.
//
// `input` declares the static config fields (set once in the canvas, not per-item).
// `execute` receives ({ input, item, itemIndex, items, ctx }, { config, credentials, execution }).
// Return a plain object (the new item.json), an Item shape, or an array of Item shapes.
export const normalizeTextField = defineNode({
  key: "example.normalize-text-field",
  title: "Normalize text field",
  description: "Trims and lowercases a named string field on each item. Escape-hatch example.",
  icon: "lucide:case-lower",
  // Static config: set once per node instance in the workflow canvas.
  input: {
    field: "text", // name of the field to normalize (default: "text")
    trim: true as boolean, // whether to trim whitespace
    lowercase: true as boolean,
  },
  execute({ input }, { config }) {
    // config is the resolved static config (field, trim, lowercase).
    // input is item.json — the per-item payload arriving at this node.
    const rawValue = String((input as Record<string, unknown>)[config.field as string] ?? "");
    let normalized = rawValue;
    if (config.trim) normalized = normalized.trim();
    if (config.lowercase) normalized = normalized.toLowerCase();
    return {
      ...(input as Record<string, unknown>),
      [config.field as string]: normalized,
    };
  },
});

// ----- Step 2: Use the custom node in a workflow -----

export default workflow("example.custom-node-template")
  .name("Custom node: normalize a text field")
  .manualTrigger<unknown>("Normalize items", [
    { text: "  Hello World  ", category: "Greeting" },
    { text: "  CODEMATION ROCKS  ", category: "Slogan" },
  ])
  // normalizeTextField.create(config, label, id)
  // config overrides the defaults declared in `input`.
  // Here we normalize the "text" field with trim=true and lowercase=true (same as defaults).
  .then(normalizeTextField.create({ field: "text", trim: true, lowercase: true }, "Normalize text", "normalize-text"))
  .build();
