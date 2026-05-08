/**
 * Unit tests for inspectorSummary() on built-in core-nodes config classes.
 *
 * No engine / DI setup required — just construct the config and call the method.
 */
import { describe, expect, it } from "vitest";

import { HttpRequest } from "../src/nodes/httpRequest";
import { AIAgent } from "../src/nodes/AIAgentConfig";
import { CronTrigger } from "../src/nodes/CronTriggerFactory";
import { ManualTrigger } from "../src/nodes/ManualTriggerFactory";
import { SubWorkflow } from "../src/nodes/subWorkflow";
import { Callback } from "../src/nodes/CallbackNodeFactory";
import { If } from "../src/nodes/if";
import { Switch } from "../src/nodes/switch";
import { Filter } from "../src/nodes/filter";
import { Split } from "../src/nodes/split";
import { Merge } from "../src/nodes/merge";
import { Wait } from "../src/nodes/wait";
import { WebhookTrigger } from "../src/nodes/WebhookTriggerFactory";
import { TestTrigger } from "../src/nodes/testTrigger";
import { Aggregate } from "../src/nodes/aggregate";
import { MapData } from "../src/nodes/mapData";
import { Assertion } from "../src/nodes/assertion";

// ---------------------------------------------------------------------------
// HttpRequest
// ---------------------------------------------------------------------------

describe("HttpRequest inspectorSummary", () => {
  it("returns method and url when url is set", () => {
    const node = new HttpRequest("req", { method: "POST", url: "https://api.example.com/items" });
    expect(node.inspectorSummary()).toEqual(
      expect.arrayContaining([
        { label: "Method", value: "POST" },
        { label: "URL", value: "https://api.example.com/items" },
      ]),
    );
  });

  it("truncates long URLs to 80 chars with ellipsis", () => {
    const longUrl = "https://api.example.com/" + "a".repeat(80);
    const node = new HttpRequest("req", { url: longUrl });
    const rows = node.inspectorSummary();
    const urlRow = rows.find((r) => r.label === "URL");
    expect(urlRow?.value.length).toBeLessThanOrEqual(80);
    expect(urlRow?.value).toMatch(/…$/);
  });

  it("falls back to urlField when url is absent", () => {
    const node = new HttpRequest("req", { urlField: "endpoint" });
    const rows = node.inspectorSummary();
    expect(rows).toContainEqual({ label: "URL field", value: "endpoint" });
  });

  it("includes response format row when set", () => {
    const node = new HttpRequest("req", { url: "https://x.com", responseFormat: "binary" });
    expect(node.inspectorSummary()).toContainEqual({ label: "Response format", value: "binary" });
  });

  it("includes body row when body kind is not none", () => {
    const node = new HttpRequest("req", { url: "https://x.com", body: { kind: "json", data: "{}" } });
    expect(node.inspectorSummary()).toContainEqual({ label: "Body", value: "json" });
  });

  it("defaults method to GET", () => {
    const node = new HttpRequest("req");
    expect(node.inspectorSummary()).toContainEqual({ label: "Method", value: "GET" });
  });
});

// ---------------------------------------------------------------------------
// AIAgent
// ---------------------------------------------------------------------------

describe("AIAgent inspectorSummary", () => {
  const chatModel = {
    type: class {},
    name: "gpt-4o",
    modelName: "gpt-4o-mini",
  } as never;

  it("returns model name row", () => {
    const agent = new AIAgent({ name: "Agent", messages: [], chatModel, tools: [] });
    const rows = agent.inspectorSummary();
    expect(rows).toContainEqual({ label: "Model", value: "gpt-4o-mini" });
  });

  it("extracts system prompt from messages array", () => {
    const agent = new AIAgent({
      name: "Agent",
      messages: [{ role: "system", content: "You are a helpful assistant." }] as never,
      chatModel,
    });
    const rows = agent.inspectorSummary();
    expect(rows).toContainEqual({ label: "System prompt", value: "You are a helpful assistant." });
  });

  it("truncates long system prompts at 80 chars", () => {
    const longPrompt = "Be very helpful. ".repeat(10);
    const agent = new AIAgent({
      name: "Agent",
      messages: [{ role: "system", content: longPrompt }] as never,
      chatModel,
    });
    const rows = agent.inspectorSummary();
    const promptRow = rows.find((r) => r.label === "System prompt");
    expect(promptRow?.value.length).toBeLessThanOrEqual(80);
  });

  it("includes tool count row when tools present", () => {
    const tools = [{ type: class {} } as never, { type: class {} } as never];
    const agent = new AIAgent({ name: "Agent", messages: [], chatModel, tools });
    const rows = agent.inspectorSummary();
    expect(rows).toContainEqual({ label: "Tools", value: "2" });
  });

  it("includes max turns when guardrails set", () => {
    const agent = new AIAgent({
      name: "Agent",
      messages: [],
      chatModel,
      guardrails: { maxTurns: 5 },
    });
    expect(agent.inspectorSummary()).toContainEqual({ label: "Max turns", value: "5" });
  });

  it("falls back to chatModel.name when modelName is unset (covers the model-resolution else-branch)", () => {
    const nameOnlyModel = { type: class {}, name: "claude-sonnet-4" } as never;
    const agent = new AIAgent({ name: "Agent", messages: [], chatModel: nameOnlyModel });
    expect(agent.inspectorSummary()).toContainEqual({ label: "Model", value: "claude-sonnet-4" });
  });
});

// ---------------------------------------------------------------------------
// CronTrigger
// ---------------------------------------------------------------------------

describe("CronTrigger inspectorSummary", () => {
  it("returns schedule row", () => {
    const trigger = new CronTrigger("daily", { schedule: "0 9 * * *" });
    expect(trigger.inspectorSummary()).toContainEqual({ label: "Schedule", value: "0 9 * * *" });
  });

  it("includes timezone row when set", () => {
    const trigger = new CronTrigger("daily", { schedule: "0 9 * * *", timezone: "Europe/Amsterdam" });
    const rows = trigger.inspectorSummary();
    expect(rows).toContainEqual({ label: "Schedule", value: "0 9 * * *" });
    expect(rows).toContainEqual({ label: "Timezone", value: "Europe/Amsterdam" });
  });

  it("omits timezone row when absent", () => {
    const trigger = new CronTrigger("daily", { schedule: "0 9 * * *" });
    expect(trigger.inspectorSummary().map((r) => r.label)).not.toContain("Timezone");
  });
});

// ---------------------------------------------------------------------------
// ManualTrigger
// ---------------------------------------------------------------------------

describe("ManualTrigger inspectorSummary", () => {
  it("returns trigger: manual row", () => {
    const trigger = new ManualTrigger("trigger");
    expect(trigger.inspectorSummary()).toContainEqual({ label: "Trigger", value: "manual" });
  });

  it("includes default items count when items provided", () => {
    const trigger = new ManualTrigger("trigger", [{ id: "a" }, { id: "b" }] as never);
    const rows = trigger.inspectorSummary();
    expect(rows).toContainEqual({ label: "Default items", value: "2" });
  });
});

// ---------------------------------------------------------------------------
// SubWorkflow
// ---------------------------------------------------------------------------

describe("SubWorkflow inspectorSummary", () => {
  it("returns workflow id row", () => {
    const node = new SubWorkflow("sub", "wf.my-workflow");
    expect(node.inspectorSummary()).toContainEqual({ label: "Workflow", value: "wf.my-workflow" });
  });

  it("includes startAt when provided", () => {
    const node = new SubWorkflow("sub", "wf.my-workflow", undefined, "node_start" as never);
    expect(node.inspectorSummary()).toContainEqual({ label: "Start at", value: "node_start" });
  });
});

// ---------------------------------------------------------------------------
// Callback
// ---------------------------------------------------------------------------

describe("Callback inspectorSummary", () => {
  it("returns undefined for anonymous function", () => {
    const node = new Callback("cb", () => []);
    expect(node.inspectorSummary()).toBeUndefined();
  });

  it("returns handler name for named function", () => {
    function myHandler() {
      return [];
    }
    const node = new Callback("cb", myHandler as never);
    expect(node.inspectorSummary()).toContainEqual({ label: "Handler", value: "myHandler" });
  });
});

// ---------------------------------------------------------------------------
// If
// ---------------------------------------------------------------------------

describe("If inspectorSummary", () => {
  it("returns predicate name when function is named", () => {
    function isActive(item: never) {
      return Boolean((item as { json: { active: boolean } }).json.active);
    }
    const node = new If("if", isActive as never);
    expect(node.inspectorSummary()).toContainEqual({ label: "Predicate", value: "isActive" });
  });

  it("returns undefined for anonymous predicate", () => {
    const node = new If("if", (item: never) => Boolean(item));
    expect(node.inspectorSummary()).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Switch
// ---------------------------------------------------------------------------

describe("Switch inspectorSummary", () => {
  it("returns cases and default rows", () => {
    const node = new Switch("sw", {
      cases: ["a", "b"],
      defaultCase: "other",
      resolveCaseKey: () => "a",
    });
    const rows = node.inspectorSummary();
    expect(rows).toContainEqual({ label: "Cases", value: "a, b" });
    expect(rows).toContainEqual({ label: "Default", value: "other" });
  });
});

// ---------------------------------------------------------------------------
// Filter
// ---------------------------------------------------------------------------

describe("Filter inspectorSummary", () => {
  it("returns predicate name for named function", () => {
    function hasEmail(item: never) {
      return Boolean((item as { json: { email: string } }).json.email);
    }
    const node = new Filter("filter", hasEmail as never);
    expect(node.inspectorSummary()).toContainEqual({ label: "Predicate", value: "hasEmail" });
  });
});

// ---------------------------------------------------------------------------
// Split
// ---------------------------------------------------------------------------

describe("Split inspectorSummary", () => {
  it("returns split-by name for named function", () => {
    function getItems(item: never) {
      return [item as never];
    }
    const node = new Split("split", getItems as never);
    expect(node.inspectorSummary()).toContainEqual({ label: "Split by", value: "getItems" });
  });
});

// ---------------------------------------------------------------------------
// Merge
// ---------------------------------------------------------------------------

describe("Merge inspectorSummary", () => {
  it("returns mode row", () => {
    const node = new Merge("merge", { mode: "append" });
    expect(node.inspectorSummary()).toContainEqual({ label: "Mode", value: "append" });
  });

  it("includes input order when prefer is set", () => {
    const node = new Merge("merge", { mode: "passThrough", prefer: ["a", "b"] as never });
    const rows = node.inspectorSummary();
    expect(rows).toContainEqual({ label: "Input order", value: "a, b" });
  });
});

// ---------------------------------------------------------------------------
// Wait
// ---------------------------------------------------------------------------

describe("Wait inspectorSummary", () => {
  it("returns duration in seconds for values >= 1000ms", () => {
    const node = new Wait("wait", 5000);
    expect(node.inspectorSummary()).toContainEqual({ label: "Duration", value: "5s" });
  });

  it("returns duration in milliseconds for values < 1000ms", () => {
    const node = new Wait("wait", 500);
    expect(node.inspectorSummary()).toContainEqual({ label: "Duration", value: "500ms" });
  });
});

// ---------------------------------------------------------------------------
// WebhookTrigger
// ---------------------------------------------------------------------------

describe("WebhookTrigger inspectorSummary", () => {
  it("returns endpoint key and methods", () => {
    const trigger = new WebhookTrigger("hook", { endpointKey: "my-endpoint", methods: ["POST", "GET"] });
    const rows = trigger.inspectorSummary();
    expect(rows).toContainEqual({ label: "Endpoint key", value: "my-endpoint" });
    expect(rows).toContainEqual({ label: "Methods", value: "POST, GET" });
  });
});

// ---------------------------------------------------------------------------
// TestTrigger
// ---------------------------------------------------------------------------

describe("TestTrigger inspectorSummary", () => {
  it("returns description when present", () => {
    const trigger = new TestTrigger({
      description: "Runs against last 5 inbox messages",
      generateItems: async function* () {},
    });
    expect(trigger.inspectorSummary()).toContainEqual({
      label: "Description",
      value: "Runs against last 5 inbox messages",
    });
  });

  it("returns undefined when no description or concurrency", () => {
    const trigger = new TestTrigger({ generateItems: async function* () {} });
    expect(trigger.inspectorSummary()).toBeUndefined();
  });

  it("truncates long descriptions at 80 chars with ellipsis", () => {
    const longDescription = "a".repeat(120);
    const trigger = new TestTrigger({ description: longDescription, cases: [] as never });
    const rows = trigger.inspectorSummary();
    const desc = rows?.find((r) => r.label === "Description");
    expect(desc).toBeDefined();
    expect(desc?.value.length).toBeLessThanOrEqual(80);
    expect(desc?.value.endsWith("…")).toBe(true);
  });

  it("includes concurrency when set", () => {
    const trigger = new TestTrigger({ concurrency: 8, generateItems: async function* () {} });
    expect(trigger.inspectorSummary()).toContainEqual({ label: "Concurrency", value: "8" });
  });
});

// ---------------------------------------------------------------------------
// Aggregate
// ---------------------------------------------------------------------------

describe("Aggregate inspectorSummary", () => {
  it("returns aggregator function name", () => {
    function sumValues(items: never[]) {
      return items;
    }
    const node = new Aggregate("agg", sumValues as never);
    expect(node.inspectorSummary()).toContainEqual({ label: "Aggregator", value: "sumValues" });
  });
});

// ---------------------------------------------------------------------------
// MapData
// ---------------------------------------------------------------------------

describe("MapData inspectorSummary", () => {
  it("returns mapper function name", () => {
    function transformItem(item: never) {
      return item;
    }
    const node = new MapData("map", transformItem as never);
    expect(node.inspectorSummary()).toContainEqual({ label: "Mapper", value: "transformItem" });
  });
});

// ---------------------------------------------------------------------------
// Assertion
// ---------------------------------------------------------------------------

describe("Assertion inspectorSummary", () => {
  it("returns assertions function name", () => {
    function checkOutput(_item: never) {
      return [{ passed: true, label: "ok", actual: "", expected: "" } as never];
    }
    const node = new Assertion({ assertions: checkOutput as never });
    expect(node.inspectorSummary()).toContainEqual({ label: "Assertions fn", value: "checkOutput" });
  });

  it("returns undefined for an anonymous assertions function (no surfaceable label)", () => {
    // Strip the property-key inferred name so the function reports name === "" — mirrors a
    // hand-rolled `(item) => [...]` passed without const-binding it first.
    const anonymous: never = ((_item: never) => [{ passed: true, label: "ok", actual: "", expected: "" }]) as never;
    Object.defineProperty(anonymous as object, "name", { value: "" });
    const node = new Assertion({ assertions: anonymous });
    expect(node.inspectorSummary()).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Anonymous-fn fallthroughs (cover the `if (!fnName) return undefined` branches)
// ---------------------------------------------------------------------------

describe("Aggregate / MapData / Filter / Split / If — anonymous function fallthrough", () => {
  it("Aggregate returns undefined for an anonymous aggregator", () => {
    const node = new Aggregate("agg", ((items: never[]) => items) as never);
    expect(node.inspectorSummary()).toBeUndefined();
  });

  it("MapData returns undefined for an anonymous mapper", () => {
    const node = new MapData("map", ((item: never) => item) as never);
    expect(node.inspectorSummary()).toBeUndefined();
  });

  it("Filter returns undefined for an anonymous predicate", () => {
    const node = new Filter("filter", ((_item: never) => true) as never);
    expect(node.inspectorSummary()).toBeUndefined();
  });

  it("Split returns undefined for an anonymous split-by", () => {
    const node = new Split("split", ((item: never) => [item]) as never);
    expect(node.inspectorSummary()).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Switch — no default case (covers the conditional default-row branch)
// ---------------------------------------------------------------------------

describe("Switch inspectorSummary — no default case", () => {
  it("omits the Default row when defaultCase is absent", () => {
    const node = new Switch("sw", {
      cases: ["a", "b"],
      resolveCaseKey: () => "a",
    });
    const rows = node.inspectorSummary();
    expect(rows).toContainEqual({ label: "Cases", value: "a, b" });
    expect(rows?.some((r) => r.label === "Default")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Callback — anonymous + named handler (covers the name-fallback branch)
// ---------------------------------------------------------------------------

describe("Callback inspectorSummary", () => {
  it("returns undefined for an anonymous Callback handler", () => {
    const node = new Callback("cb", async (items) => items as never);
    expect(node.inspectorSummary()).toBeUndefined();
  });

  it("returns the handler function name when named", () => {
    async function transformBatch(items: never[]) {
      return items as never;
    }
    const node = new Callback("cb", transformBatch as never);
    expect(node.inspectorSummary()).toContainEqual({ label: "Handler", value: "transformBatch" });
  });
});
