import assert from "node:assert/strict";
import path from "node:path";
import { test } from "vitest";

import { ConsumerEnvDotenvFilePredicate } from "../src/dev/ConsumerEnvDotenvFilePredicate";
import { DevSourceChangeClassifier } from "../src/dev/DevSourceChangeClassifier";
import { DevSourceRebuildPlanner } from "../src/dev/DevSourceRebuildPlanner";

class DevSourceRebuildPlannerTestHarness {
  createPlanner(): DevSourceRebuildPlanner {
    return new DevSourceRebuildPlanner(new ConsumerEnvDotenvFilePredicate(), new DevSourceChangeClassifier());
  }
}

test("plan returns manual restart guidance for dotenv-only changes", () => {
  const harness = new DevSourceRebuildPlannerTestHarness();
  const planner = harness.createPlanner();
  const consumerRoot = "/tmp/consumer";

  assert.deepEqual(
    planner.plan({
      changedPaths: [path.resolve(consumerRoot, ".env.local")],
      consumerRoot,
    }),
    {
      kind: "restart-dev-process",
      message:
        "\n[codemation] Consumer environment file changed (e.g. .env). Restart the `codemation dev` process so the runtime picks up updated variables (host `process.env` does not hot-reload).\n",
    },
  );
});

test("plan queues a runtime-only rebuild for workflow changes", () => {
  const harness = new DevSourceRebuildPlannerTestHarness();
  const planner = harness.createPlanner();
  const consumerRoot = "/tmp/consumer";

  assert.deepEqual(
    planner.plan({
      changedPaths: [path.resolve(consumerRoot, "src", "workflows", "hello.ts")],
      consumerRoot,
    }),
    {
      kind: "queue-rebuild",
      announcement: "\n[codemation] Source change detected — rebuilding consumer and restarting the runtime…\n",
      request: {
        changedPaths: [path.resolve(consumerRoot, "src", "workflows", "hello.ts")],
        shouldRepublishConsumerOutput: true,
        shouldRestartUi: false,
      },
    },
  );
});

test("plan queues a runtime and UI rebuild for config changes", () => {
  const harness = new DevSourceRebuildPlannerTestHarness();
  const planner = harness.createPlanner();
  const consumerRoot = "/tmp/consumer";

  assert.deepEqual(
    planner.plan({
      changedPaths: [path.resolve(consumerRoot, "codemation.config.ts")],
      consumerRoot,
    }),
    {
      kind: "queue-rebuild",
      announcement:
        "\n[codemation] Source change detected — rebuilding consumer, restarting the runtime, and restarting the UI…\n",
      request: {
        changedPaths: [path.resolve(consumerRoot, "codemation.config.ts")],
        shouldRepublishConsumerOutput: true,
        shouldRestartUi: true,
      },
    },
  );
});

test("plan preserves runtime restart without republish for framework package changes", () => {
  const harness = new DevSourceRebuildPlannerTestHarness();
  const planner = harness.createPlanner();
  const consumerRoot = "/tmp/consumer";

  assert.deepEqual(
    planner.plan({
      changedPaths: ["/workspace/packages/core/src/index.ts"],
      consumerRoot,
    }),
    {
      kind: "queue-rebuild",
      announcement: "\n[codemation] Source change detected — rebuilding consumer and restarting the runtime…\n",
      request: {
        changedPaths: ["/workspace/packages/core/src/index.ts"],
        shouldRepublishConsumerOutput: false,
        shouldRestartUi: false,
      },
    },
  );
});
