import assert from "node:assert/strict";
import path from "node:path";
import { test } from "vitest";

import { ConsumerOutputRebuildPlanner } from "../src/consumer/ConsumerOutputRebuildPlanner";

class ConsumerOutputRebuildPlannerTestHarness {
  createPlanner(): ConsumerOutputRebuildPlanner {
    return new ConsumerOutputRebuildPlanner();
  }

  createChangeEvent(filePath: string): Readonly<{ event: string; path: string }> {
    return {
      event: "change",
      path: filePath,
    };
  }
}

test("plan returns full rebuild when there are no watch events", () => {
  const harness = new ConsumerOutputRebuildPlannerTestHarness();
  const planner = harness.createPlanner();

  assert.deepEqual(
    planner.plan({
      configSourcePath: "/tmp/consumer/codemation.config.ts",
      hasPreviousSnapshot: true,
      watchEvents: [],
    }),
    {
      kind: "full",
    },
  );
});

test("plan returns full rebuild when there is no previous snapshot", () => {
  const harness = new ConsumerOutputRebuildPlannerTestHarness();
  const planner = harness.createPlanner();
  const workflowPath = path.resolve("/tmp/consumer", "src", "workflows", "hello.ts");

  assert.deepEqual(
    planner.plan({
      configSourcePath: "/tmp/consumer/codemation.config.ts",
      hasPreviousSnapshot: false,
      watchEvents: [harness.createChangeEvent(workflowPath)],
    }),
    {
      kind: "full",
    },
  );
});

test("plan returns full rebuild when the config path is unknown", () => {
  const harness = new ConsumerOutputRebuildPlannerTestHarness();
  const planner = harness.createPlanner();
  const workflowPath = path.resolve("/tmp/consumer", "src", "workflows", "hello.ts");

  assert.deepEqual(
    planner.plan({
      configSourcePath: null,
      hasPreviousSnapshot: true,
      watchEvents: [harness.createChangeEvent(workflowPath)],
    }),
    {
      kind: "full",
    },
  );
});

test("plan returns incremental rebuild when the classifier allows it", () => {
  const harness = new ConsumerOutputRebuildPlannerTestHarness();
  const planner = harness.createPlanner();
  const workflowPath = path.resolve("/tmp/consumer", "src", "workflows", "hello.ts");

  assert.deepEqual(
    planner.plan({
      configSourcePath: "/tmp/consumer/codemation.config.ts",
      hasPreviousSnapshot: true,
      watchEvents: [harness.createChangeEvent(workflowPath)],
    }),
    {
      kind: "incremental",
      sourcePaths: [workflowPath],
    },
  );
});
