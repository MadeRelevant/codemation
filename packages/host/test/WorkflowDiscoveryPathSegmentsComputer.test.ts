import assert from "node:assert/strict";
import path from "node:path";
import { test } from "vitest";

import { WorkflowDiscoveryPathSegmentsComputer } from "../src/presentation/server/WorkflowDiscoveryPathSegmentsComputer";

const computer = new WorkflowDiscoveryPathSegmentsComputer();

test("computes nested path segments under src/workflows", () => {
  const consumerRoot = path.resolve("/app");
  const wf = path.resolve("/app/src/workflows/a/b/my-flow.ts");
  const segments = computer.compute({
    consumerRoot,
    workflowDiscoveryDirectories: ["src/workflows"],
    absoluteWorkflowModulePath: wf,
  });
  assert.deepEqual(segments, ["a", "b", "my-flow"]);
});

test("returns undefined when file is outside discovery roots", () => {
  const segments = computer.compute({
    consumerRoot: path.resolve("/app"),
    workflowDiscoveryDirectories: ["src/workflows"],
    absoluteWorkflowModulePath: path.resolve("/other/src/workflows/x.ts"),
  });
  assert.equal(segments, undefined);
});
