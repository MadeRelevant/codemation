import assert from "node:assert/strict";
import path from "node:path";
import { test } from "vitest";

import { ConsumerOutputSourceChangeClassifier } from "../src/consumer/ConsumerOutputSourceChangeClassifier";

class ConsumerOutputSourceChangeClassifierTestHarness {
  createClassifier(): ConsumerOutputSourceChangeClassifier {
    return new ConsumerOutputSourceChangeClassifier();
  }

  createChangeEvent(filePath: string): Readonly<{ event: string; path: string }> {
    return {
      event: "change",
      path: filePath,
    };
  }

  createAddEvent(filePath: string): Readonly<{ event: string; path: string }> {
    return {
      event: "add",
      path: filePath,
    };
  }
}

test("classifyRebuild returns incremental source paths for supported source changes", () => {
  const harness = new ConsumerOutputSourceChangeClassifierTestHarness();
  const classifier = harness.createClassifier();
  const consumerRoot = "/tmp/consumer";
  const workflowPath = path.resolve(consumerRoot, "src", "workflows", "hello.ts");

  assert.deepEqual(
    classifier.classifyRebuild({
      configSourcePath: path.resolve(consumerRoot, "codemation.config.ts"),
      events: [harness.createChangeEvent(workflowPath)],
    }),
    {
      kind: "incremental",
      sourcePaths: [workflowPath],
    },
  );
});

test("classifyRebuild returns full rebuild when the config changes", () => {
  const harness = new ConsumerOutputSourceChangeClassifierTestHarness();
  const classifier = harness.createClassifier();
  const consumerRoot = "/tmp/consumer";
  const configPath = path.resolve(consumerRoot, "codemation.config.ts");

  assert.deepEqual(
    classifier.classifyRebuild({
      configSourcePath: configPath,
      events: [harness.createChangeEvent(configPath)],
    }),
    {
      kind: "full",
    },
  );
});

test("classifyRebuild returns full rebuild for asset changes", () => {
  const harness = new ConsumerOutputSourceChangeClassifierTestHarness();
  const classifier = harness.createClassifier();
  const consumerRoot = "/tmp/consumer";

  assert.deepEqual(
    classifier.classifyRebuild({
      configSourcePath: path.resolve(consumerRoot, "codemation.config.ts"),
      events: [harness.createChangeEvent(path.resolve(consumerRoot, ".env.local"))],
    }),
    {
      kind: "full",
    },
  );
});

test("classifyRebuild returns full rebuild for non-change watch events", () => {
  const harness = new ConsumerOutputSourceChangeClassifierTestHarness();
  const classifier = harness.createClassifier();
  const consumerRoot = "/tmp/consumer";

  assert.deepEqual(
    classifier.classifyRebuild({
      configSourcePath: path.resolve(consumerRoot, "codemation.config.ts"),
      events: [harness.createAddEvent(path.resolve(consumerRoot, "src", "workflows", "hello.ts"))],
    }),
    {
      kind: "full",
    },
  );
});

test("classifyRebuild deduplicates incremental source paths", () => {
  const harness = new ConsumerOutputSourceChangeClassifierTestHarness();
  const classifier = harness.createClassifier();
  const consumerRoot = "/tmp/consumer";
  const workflowPath = path.resolve(consumerRoot, "src", "workflows", "hello.ts");

  assert.deepEqual(
    classifier.classifyRebuild({
      configSourcePath: path.resolve(consumerRoot, "codemation.config.ts"),
      events: [harness.createChangeEvent(workflowPath), harness.createChangeEvent(workflowPath)],
    }),
    {
      kind: "incremental",
      sourcePaths: [workflowPath],
    },
  );
});

test("classifyRebuild returns full rebuild when only non-source files changed", () => {
  const harness = new ConsumerOutputSourceChangeClassifierTestHarness();
  const classifier = harness.createClassifier();
  const consumerRoot = "/tmp/consumer";

  assert.deepEqual(
    classifier.classifyRebuild({
      configSourcePath: path.resolve(consumerRoot, "codemation.config.ts"),
      events: [harness.createChangeEvent(path.resolve(consumerRoot, "README.md"))],
    }),
    {
      kind: "full",
    },
  );
});

test("createIgnoredMatcher ignores .codemation and node_modules paths inside the consumer root", () => {
  const harness = new ConsumerOutputSourceChangeClassifierTestHarness();
  const classifier = harness.createClassifier();
  const consumerRoot = "/tmp/consumer";
  const ignoredMatcher = classifier.createIgnoredMatcher(consumerRoot);

  assert.equal(ignoredMatcher(path.resolve(consumerRoot, ".codemation", "output", "current.json")), true);
  assert.equal(ignoredMatcher(path.resolve(consumerRoot, "node_modules", "dep", "index.js")), true);
  assert.equal(ignoredMatcher(path.resolve(consumerRoot, "src", "workflows", "hello.ts")), false);
  assert.equal(ignoredMatcher("/tmp/other-project/node_modules/dep/index.js"), false);
});
