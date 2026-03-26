import assert from "node:assert/strict";
import { test } from "vitest";
import type { WorkflowDefinition } from "@codemation/core";

import { CodemationConsumerAppResolver } from "../../src/presentation/server/CodemationConsumerAppResolver";

const resolver = new CodemationConsumerAppResolver();

function minimalWorkflow(
  id: string,
  extra?: Readonly<{ discoveryPathSegments?: readonly string[] }>,
): WorkflowDefinition {
  return {
    id,
    name: "N",
    nodes: [],
    edges: [],
    ...(extra?.discoveryPathSegments !== undefined ? { discoveryPathSegments: extra.discoveryPathSegments } : {}),
  };
}

test("resolve merges discoveryPathSegments from workflowDiscoveryPathSegmentsList", () => {
  const result = resolver.resolve({
    configModule: { default: { runtime: {} } },
    workflowModules: [{ exported: minimalWorkflow("wf.one") }],
    workflowSourcePaths: ["/consumer/src/workflows/a/b.ts"],
    workflowDiscoveryPathSegmentsList: [["integrations", "gmail", "pull"]],
  });
  const workflows = result.config.workflows ?? [];
  assert.equal(workflows.length, 1);
  assert.deepEqual(workflows[0]?.discoveryPathSegments, ["integrations", "gmail", "pull"]);
});

test("resolve leaves workflows unchanged when path segment list is empty for that module", () => {
  const result = resolver.resolve({
    configModule: { default: { runtime: {} } },
    workflowModules: [{ exported: minimalWorkflow("wf.plain") }],
    workflowSourcePaths: ["/x.ts"],
    workflowDiscoveryPathSegmentsList: [[]],
  });
  assert.equal(result.config.workflows?.[0]?.discoveryPathSegments, undefined);
});

test("resolve does not inject paths when config lists workflows inline", () => {
  const inline = minimalWorkflow("wf.inline");
  const result = resolver.resolve({
    configModule: {
      default: {
        runtime: {},
        workflows: [inline],
      },
    },
    workflowModules: [],
    workflowSourcePaths: [],
  });
  assert.deepEqual(result.workflowSources, []);
  assert.equal(result.config.workflows?.[0]?.discoveryPathSegments, undefined);
});

test("resolve skips modules whose exports are not workflow definitions", () => {
  const result = resolver.resolve({
    configModule: { default: { runtime: {} } },
    workflowModules: [{ presets: { x: 1 } }, { exported: minimalWorkflow("wf.real") }],
    workflowSourcePaths: ["/consumer/src/workflows/lib/presets.ts", "/consumer/src/workflows/foo.ts"],
  });
  assert.equal(result.config.workflows?.length, 1);
  assert.equal(result.config.workflows?.[0]?.id, "wf.real");
});

test("resolve throws when every discovered module lacks workflow exports", () => {
  assert.throws(
    () =>
      resolver.resolve({
        configModule: { default: { runtime: {} } },
        workflowModules: [{ presets: { x: 1 } }],
        workflowSourcePaths: ["/consumer/src/workflows/lib/presets.ts"],
      }),
    (error: unknown) =>
      error instanceof Error &&
      error.message.includes("none export a WorkflowDefinition") &&
      error.message.includes("presets.ts"),
  );
});
