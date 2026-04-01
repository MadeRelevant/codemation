import assert from "node:assert/strict";
import path from "node:path";
import { test } from "vitest";

import { DevSourceChangeClassifier } from "../src/dev/DevSourceChangeClassifier";

test("requiresUiRestart returns false for consumer workflow changes", () => {
  const classifier = new DevSourceChangeClassifier();
  const consumerRoot = "/tmp/my-automation";

  assert.equal(
    classifier.requiresUiRestart({
      changedPaths: [path.resolve(consumerRoot, "src", "workflows", "starter", "hello.ts")],
      consumerRoot,
    }),
    false,
  );
});

test("requiresUiRestart returns false for framework package changes outside the consumer root", () => {
  const classifier = new DevSourceChangeClassifier();
  const consumerRoot = "/tmp/my-automation";

  assert.equal(
    classifier.requiresUiRestart({
      changedPaths: ["/workspace/packages/core/src/index.ts"],
      consumerRoot,
    }),
    false,
  );
});

test("requiresUiRestart returns true for consumer config changes", () => {
  const classifier = new DevSourceChangeClassifier();
  const consumerRoot = "/tmp/my-automation";

  assert.equal(
    classifier.requiresUiRestart({
      changedPaths: [path.resolve(consumerRoot, "codemation.config.ts")],
      consumerRoot,
    }),
    true,
  );
});

test("requiresUiRestart returns false for plugin sandbox config changes", () => {
  const classifier = new DevSourceChangeClassifier();
  const consumerRoot = "/tmp/my-automation";

  assert.equal(
    classifier.requiresUiRestart({
      changedPaths: [path.resolve(consumerRoot, "codemation.plugin.ts")],
      consumerRoot,
    }),
    false,
  );
});

test("requiresUiRestart returns false for workflow-only changes", () => {
  const classifier = new DevSourceChangeClassifier();
  const consumerRoot = "/tmp/my-automation";

  assert.equal(
    classifier.requiresUiRestart({
      changedPaths: [path.resolve(consumerRoot, "src", "workflows", "starter", "hello.ts")],
      consumerRoot,
    }),
    false,
  );
});

test("requiresUiRestart returns true for credential changes", () => {
  const classifier = new DevSourceChangeClassifier();
  const consumerRoot = "/tmp/my-automation";

  assert.equal(
    classifier.requiresUiRestart({
      changedPaths: [path.resolve(consumerRoot, "src", "credentials", "openAiCredential.ts")],
      consumerRoot,
    }),
    true,
  );
});

test("requiresUiRestart returns false for plugin-only changes", () => {
  const classifier = new DevSourceChangeClassifier();
  const consumerRoot = "/tmp/my-automation";

  assert.equal(
    classifier.requiresUiRestart({
      changedPaths: [path.resolve(consumerRoot, "src", "plugins", "customPlugin.ts")],
      consumerRoot,
    }),
    false,
  );
});
