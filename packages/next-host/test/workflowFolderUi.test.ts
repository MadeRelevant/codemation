import assert from "node:assert/strict";
import { test } from "vitest";

import type { WorkflowSummary } from "../src/features/workflows/hooks/realtime/realtime";
import type { WorkflowFolderTreeNode } from "../src/shell/WorkflowFolderTreeBuilder";
import { WorkflowFolderUi } from "../src/shell/WorkflowFolderUi";

function summary(
  id: string,
  name: string,
  discoveryPathSegments: readonly string[],
): WorkflowSummary {
  return { id, name, discoveryPathSegments };
}

const emptyNode = (): WorkflowFolderTreeNode => ({
  segment: "",
  children: [],
  workflows: [],
});

test("computeDefaultFolderOpen is true for empty folder path", () => {
  assert.equal(
    WorkflowFolderUi.computeDefaultFolderOpen([], "/workflows/wf.x", [summary("wf.x", "X", ["a", "b"])]),
    true,
  );
});

test("computeDefaultFolderOpen is true when not on a workflow detail route", () => {
  assert.equal(
    WorkflowFolderUi.computeDefaultFolderOpen(["a", "b"], "/workflows", [summary("wf.x", "X", ["a", "b", "c"])]),
    true,
  );
  assert.equal(
    WorkflowFolderUi.computeDefaultFolderOpen(["a"], "/dashboard", [summary("wf.x", "X", ["a"])]),
    true,
  );
});

test("computeDefaultFolderOpen follows active workflow path", () => {
  const workflows = [summary("wf.active", "Active", ["integrations", "gmail", "gmail"])];
  assert.equal(
    WorkflowFolderUi.computeDefaultFolderOpen(["integrations"], "/workflows/wf.active", workflows),
    true,
  );
  assert.equal(
    WorkflowFolderUi.computeDefaultFolderOpen(["integrations", "gmail"], "/workflows/wf.active", workflows),
    true,
  );
  assert.equal(
    WorkflowFolderUi.computeDefaultFolderOpen(["samples"], "/workflows/wf.active", workflows),
    false,
  );
});

test("computeDefaultFolderOpen decodes workflow id in the URL", () => {
  const workflows = [summary("wf.with%2Fedge", "Edge", ["a", "b"])];
  assert.equal(
    WorkflowFolderUi.computeDefaultFolderOpen(["a"], "/workflows/wf.with%2Fedge", workflows),
    true,
  );
});

test("computeDefaultFolderOpen is true when active id is unknown", () => {
  assert.equal(
    WorkflowFolderUi.computeDefaultFolderOpen(["a"], "/workflows/missing", [summary("wf.other", "O", ["b"])]),
    true,
  );
});

test("countWorkflowsInSubtree sums workflows in nested folders", () => {
  const node: WorkflowFolderTreeNode = {
    segment: "root",
    workflows: [summary("w1", "A", [])],
    children: [
      {
        segment: "child",
        workflows: [summary("w2", "B", [])],
        children: [
          {
            segment: "leaf",
            workflows: [summary("w3", "C", [])],
            children: [],
          },
        ],
      },
    ],
  };
  assert.equal(WorkflowFolderUi.countWorkflowsInSubtree(emptyNode()), 0);
  assert.equal(WorkflowFolderUi.countWorkflowsInSubtree(node), 3);
});
