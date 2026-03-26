import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LogLevelPolicy } from "../../src/infrastructure/logging/LogLevelPolicy";

describe("LogLevelPolicy", () => {
  beforeEach(() => {
    delete process.env.VITEST;
  });

  afterEach(() => {
    delete process.env.CODEMATION_LOG_LEVEL;
    delete process.env.VITEST;
  });

  it("uses the first matching codemation rule for a namespace", () => {
    const policy = new LogLevelPolicy();
    policy.applyCodemationLogConfig({
      rules: [
        { filter: "codemation.webhooks.*", level: "info" },
        { filter: "*", level: "error" },
      ],
    });
    process.env.CODEMATION_LOG_LEVEL = "error";
    expect(policy.shouldEmit("warn", "codemation.webhooks.routing")).toBe(true);
    expect(policy.shouldEmit("info", "codemation.webhooks.routing")).toBe(true);
    expect(policy.shouldEmit("warn", "codemation.other")).toBe(false);
    expect(policy.shouldEmit("error", "codemation.other")).toBe(true);
  });

  it("falls back to CODEMATION_LOG_LEVEL when no rule matches", () => {
    const policy = new LogLevelPolicy();
    policy.applyCodemationLogConfig({
      rules: [{ filter: "only.this.*", level: "debug" }],
    });
    process.env.CODEMATION_LOG_LEVEL = "warn";
    expect(policy.shouldEmit("info", "other.ns")).toBe(false);
    expect(policy.shouldEmit("warn", "other.ns")).toBe(true);
  });

  it("supports a single-rule shorthand config", () => {
    const policy = new LogLevelPolicy();
    policy.applyCodemationLogConfig({ filter: "a.*", level: "silent" });
    expect(policy.shouldEmit("error", "a.b")).toBe(false);
  });

  it("resetForTests clears codemation rules", () => {
    const policy = new LogLevelPolicy();
    policy.applyCodemationLogConfig({ filter: "*", level: "error" });
    policy.resetForTests();
    process.env.CODEMATION_LOG_LEVEL = "debug";
    expect(policy.shouldEmit("info", "any")).toBe(true);
  });

  it("matches a lone * against any namespace", () => {
    const policy = new LogLevelPolicy();
    policy.applyCodemationLogConfig({ filter: "*", level: "info" });
    process.env.CODEMATION_LOG_LEVEL = "error";
    expect(policy.shouldEmit("info", "codemation.webhooks.routing")).toBe(true);
    expect(policy.shouldEmit("info", "a")).toBe(true);
  });

  it("matches a prefix glob segment for webhooks", () => {
    const policy = new LogLevelPolicy();
    policy.applyCodemationLogConfig({ filter: "codemation.webhooks.*", level: "info" });
    process.env.CODEMATION_LOG_LEVEL = "error";
    expect(policy.shouldEmit("info", "codemation.webhooks.routing")).toBe(true);
    expect(policy.shouldEmit("info", "codemation.engine.triggers")).toBe(false);
  });

  it("treats dots in namespace as literal glob segments", () => {
    const policy = new LogLevelPolicy();
    policy.applyCodemationLogConfig({ filter: "a.b", level: "info" });
    process.env.CODEMATION_LOG_LEVEL = "error";
    expect(policy.shouldEmit("info", "a.b")).toBe(true);
    expect(policy.shouldEmit("info", "aXb")).toBe(false);
  });

  it("matches if any filter in an array matches the namespace", () => {
    const policy = new LogLevelPolicy();
    policy.applyCodemationLogConfig({
      rules: [
        { filter: ["codemation.webhooks.*", "codemation.engine.*"], level: "debug" },
        { filter: "*", level: "error" },
      ],
    });
    process.env.CODEMATION_LOG_LEVEL = "error";
    expect(policy.shouldEmit("debug", "codemation.webhooks.routing")).toBe(true);
    expect(policy.shouldEmit("debug", "codemation.engine.triggers")).toBe(true);
    expect(policy.shouldEmit("info", "codemation.other")).toBe(false);
  });
});
