import assert from "node:assert/strict";
import { test } from "vitest";

import type { WorkflowSummary } from "../src/features/workflows/hooks/realtime/realtime";
import { WorkflowFolderTreeBuilder } from "../src/shell/WorkflowFolderTreeBuilder";

function wf(args: Readonly<{ id: string; name: string; discoveryPathSegments: readonly string[] }>): WorkflowSummary {
  return {
    id: args.id,
    name: args.name,
    discoveryPathSegments: args.discoveryPathSegments,
  };
}

const builder = new WorkflowFolderTreeBuilder();

test("build treats absent discoveryPathSegments like an empty path (flat list)", () => {
  const legacy = { id: "wf.legacy", name: "Legacy" } as unknown as WorkflowSummary;
  const tree = builder.build([legacy]);
  assert.equal(tree.children.length, 0);
  assert.equal(tree.workflows.length, 1);
  assert.equal(tree.workflows[0]?.id, "wf.legacy");
});

test("build returns empty root for no workflows", () => {
  const tree = builder.build([]);
  assert.equal(tree.segment, "");
  assert.deepEqual(tree.workflows, []);
  assert.deepEqual(tree.children, []);
});

test("build places workflows with no path segments on the root", () => {
  const tree = builder.build([wf({ id: "wf.root", name: "Root", discoveryPathSegments: [] })]);
  assert.equal(tree.workflows.length, 1);
  assert.equal(tree.workflows[0]?.id, "wf.root");
  assert.deepEqual(tree.children, []);
});

test("build nests workflows by discovery segments (single-level file)", () => {
  const tree = builder.build([wf({ id: "wf.demo", name: "Demo", discoveryPathSegments: ["samples", "demo"] })]);
  assert.deepEqual(tree.workflows, []);
  assert.equal(tree.children.length, 1);
  assert.equal(tree.children[0]?.segment, "samples");
  assert.equal(tree.children[0]?.workflows.length, 1);
  assert.equal(tree.children[0]?.workflows[0]?.id, "wf.demo");
  assert.deepEqual(tree.children[0]?.children, []);
});

test("build nests deep paths and sorts folder children alphabetically", () => {
  const tree = builder.build([
    wf({ id: "wf.2", name: "B", discoveryPathSegments: ["z", "leaf"] }),
    wf({ id: "wf.1", name: "A", discoveryPathSegments: ["a", "b", "file"] }),
  ]);
  assert.equal(tree.children.length, 2);
  assert.equal(tree.children[0]?.segment, "a");
  assert.equal(tree.children[1]?.segment, "z");
  const aBranch = tree.children[0];
  assert.equal(aBranch?.children.length, 1);
  assert.equal(aBranch?.children[0]?.segment, "b");
  assert.deepEqual(aBranch?.children[0]?.children, []);
  assert.equal(aBranch?.children[0]?.workflows[0]?.id, "wf.1");
});

test("build sorts workflows with identical paths by name", () => {
  const tree = builder.build([
    wf({ id: "wf.b", name: "Beta", discoveryPathSegments: ["group", "b"] }),
    wf({ id: "wf.a", name: "Alpha", discoveryPathSegments: ["group", "a"] }),
  ]);
  const group = tree.children[0]?.workflows ?? [];
  assert.equal(group[0]?.name, "Alpha");
  assert.equal(group[1]?.name, "Beta");
});

test("build combines workflows and subfolders under the same segment", () => {
  const tree = builder.build([
    wf({ id: "wf.only", name: "Only file", discoveryPathSegments: ["foo", "only"] }),
    wf({ id: "wf.nested", name: "Nested", discoveryPathSegments: ["foo", "bar", "baz"] }),
  ]);
  const foo = tree.children.find((c) => c.segment === "foo");
  assert.ok(foo);
  assert.equal(foo.workflows.length, 1);
  assert.equal(foo.workflows[0]?.id, "wf.only");
  assert.equal(foo.children.length, 1);
  assert.equal(foo.children[0]?.segment, "bar");
});
