import assert from "node:assert/strict";
import { test } from "vitest";
import type { WorkflowDefinition } from "@codemation/core";

import { WorkflowDefinitionMapper } from "../src/application/mapping/WorkflowDefinitionMapper";
import { WorkflowPolicyUiPresentationFactory } from "../src/application/mapping/WorkflowPolicyUiPresentationFactory";

const mapper = new WorkflowDefinitionMapper(new WorkflowPolicyUiPresentationFactory());

function minimalWorkflow(
  args: Readonly<{ id: string; name: string; discoveryPathSegments?: readonly string[] }>,
): WorkflowDefinition {
  return {
    id: args.id,
    name: args.name,
    nodes: [],
    edges: [],
    ...(args.discoveryPathSegments !== undefined ? { discoveryPathSegments: args.discoveryPathSegments } : {}),
  };
}

test("toSummary maps discoveryPathSegments when present", () => {
  const summary = mapper.toSummary(
    minimalWorkflow({ id: "wf.a", name: "A", discoveryPathSegments: ["x", "y"] }),
  );
  assert.equal(summary.id, "wf.a");
  assert.equal(summary.name, "A");
  assert.deepEqual(summary.discoveryPathSegments, ["x", "y"]);
});

test("toSummary uses empty array when discoveryPathSegments is absent", () => {
  const summary = mapper.toSummary(minimalWorkflow({ id: "wf.b", name: "B" }));
  assert.deepEqual(summary.discoveryPathSegments, []);
});
