import assert from "node:assert/strict";
import { test } from "vitest";
import type { WorkflowDefinition } from "@codemation/core";

import { WorkflowDefinitionExportsResolver } from "../../src/presentation/server/WorkflowDefinitionExportsResolver";

const resolver = new WorkflowDefinitionExportsResolver();

function minimalWorkflow(id: string): WorkflowDefinition {
  return { id, name: "N", nodes: [], edges: [] };
}

test("resolve returns workflow exports and ignores helpers", () => {
  const result = resolver.resolve({
    helper: { notAWorkflow: true },
    wf: minimalWorkflow("wf.one"),
    another: "string",
  });
  assert.equal(result.length, 1);
  assert.equal(result[0]?.id, "wf.one");
});

test("resolve returns empty array when module has no workflow-shaped exports", () => {
  const result = resolver.resolve({
    presets: { demo: "x" },
    default: () => undefined,
  });
  assert.equal(result.length, 0);
});
