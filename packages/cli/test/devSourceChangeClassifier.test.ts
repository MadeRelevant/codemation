import assert from "node:assert/strict";
import path from "node:path";
import { test } from "vitest";

import { DevSourceChangeClassifier } from "../src/dev/DevSourceChangeClassifier";

test("shouldRepublishConsumerOutput returns true for consumer workflow changes", () => {
  const classifier = new DevSourceChangeClassifier();
  const consumerRoot = "/tmp/my-automation";

  assert.equal(
    classifier.shouldRepublishConsumerOutput({
      changedPaths: [path.resolve(consumerRoot, "src", "workflows", "starter", "hello.ts")],
      consumerRoot,
    }),
    true,
  );
});

test("shouldRepublishConsumerOutput returns false for framework package changes outside the consumer root", () => {
  const classifier = new DevSourceChangeClassifier();
  const consumerRoot = "/tmp/my-automation";

  assert.equal(
    classifier.shouldRepublishConsumerOutput({
      changedPaths: ["/workspace/packages/core/src/index.ts"],
      consumerRoot,
    }),
    false,
  );
});

test("requiresNextHostRestart returns true for consumer config changes", () => {
  const classifier = new DevSourceChangeClassifier();
  const consumerRoot = "/tmp/my-automation";

  assert.equal(
    classifier.requiresNextHostRestart({
      changedPaths: [path.resolve(consumerRoot, "codemation.config.ts")],
      consumerRoot,
    }),
    true,
  );
});

test("requiresNextHostRestart returns false for workflow-only changes", () => {
  const classifier = new DevSourceChangeClassifier();
  const consumerRoot = "/tmp/my-automation";

  assert.equal(
    classifier.requiresNextHostRestart({
      changedPaths: [path.resolve(consumerRoot, "src", "workflows", "starter", "hello.ts")],
      consumerRoot,
    }),
    false,
  );
});
