import { describe, it, expect } from "vitest";
import type { PersistedTriggerSetupState, TriggerInstanceId, TriggerSetupStateRepository } from "@codemation/core";
import { NoOpPollingTriggerLogger, PollingTriggerRuntime } from "@codemation/core";
import { definePollingTrigger, DefinedPollingTriggerConfig } from "../../src/authoring/definePollingTrigger.types";

// ---------------------------------------------------------------------------
// Minimal in-memory state repository (reused from PollingTriggerRuntime.test.ts)
// ---------------------------------------------------------------------------

class InMemoryTriggerSetupStateRepository implements TriggerSetupStateRepository {
  private readonly statesByKey = new Map<string, PersistedTriggerSetupState>();

  async load(trigger: TriggerInstanceId): Promise<PersistedTriggerSetupState | undefined> {
    return this.statesByKey.get(`${trigger.workflowId}:${trigger.nodeId}`);
  }

  async save(state: PersistedTriggerSetupState): Promise<void> {
    this.statesByKey.set(`${state.trigger.workflowId}:${state.trigger.nodeId}`, state);
  }

  async delete(trigger: TriggerInstanceId): Promise<void> {
    this.statesByKey.delete(`${trigger.workflowId}:${trigger.nodeId}`);
  }
}

function makeRuntime(repo?: TriggerSetupStateRepository): PollingTriggerRuntime {
  return new PollingTriggerRuntime(repo ?? new InMemoryTriggerSetupStateRepository(), new NoOpPollingTriggerLogger());
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("definePollingTrigger", () => {
  it("returns an object with kind, key, title, poll, create and register", () => {
    const trigger = definePollingTrigger({
      key: "test.basic-trigger",
      title: "Basic trigger",
      initialState: () => ({ count: 0 }),
      poll: async ({ state }) => ({
        items: [{ json: { value: state.count }, dedupKey: String(state.count) }],
        nextState: { count: state.count + 1 },
      }),
    });

    expect(trigger.kind).toBe("defined-polling-trigger");
    expect(trigger.key).toBe("test.basic-trigger");
    expect(trigger.title).toBe("Basic trigger");
    expect(typeof trigger.poll).toBe("function");
    expect(typeof trigger.create).toBe("function");
    expect(typeof trigger.register).toBe("function");
  });

  it("poll() is directly callable as a test seam without the runtime", async () => {
    interface MyState {
      lastId?: string;
    }

    const trigger = definePollingTrigger({
      key: "test.poll-seam",
      title: "Poll seam",
      initialState: (): MyState => ({}),
      poll: async ({ state }) => ({
        items: [{ json: { id: "msg-1", prev: state.lastId }, dedupKey: "msg-1" }],
        nextState: { lastId: "msg-1" },
      }),
    });

    const result = await trigger.poll({
      config: {},
      state: { lastId: undefined },
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.json).toEqual({ id: "msg-1", prev: undefined });
    expect(result.nextState).toEqual({ lastId: "msg-1" });
  });

  it("create() returns a DefinedPollingTriggerConfig with kind trigger", () => {
    const trigger = definePollingTrigger({
      key: "test.create-check",
      title: "Create check",
      icon: "lucide:bell",
      initialState: () => ({ seen: [] as string[] }),
      poll: async ({ state }) => ({
        items: [],
        nextState: state,
      }),
    });

    const config = trigger.create({}, "My trigger name", "node-id-1");

    expect(config).toBeInstanceOf(DefinedPollingTriggerConfig);
    expect(config.kind).toBe("trigger");
    expect(config.name).toBe("My trigger name");
    expect(config.icon).toBe("lucide:bell");
    expect(config.id).toBe("node-id-1");
    expect(typeof config.type).toBe("function");
  });

  it("create() defaults name to title when not supplied", () => {
    const trigger = definePollingTrigger({
      key: "test.default-name",
      title: "Default name trigger",
      initialState: () => ({}),
      poll: async ({ state }) => ({ items: [], nextState: state }),
    });

    const config = trigger.create({});
    expect(config.name).toBe("Default name trigger");
  });

  it("getCredentialRequirements() returns credential requirements from bindings", () => {
    const trigger = definePollingTrigger({
      key: "test.cred-requirements",
      title: "Cred requirements",
      credentials: {
        auth: "my-cred-type-id",
      },
      initialState: () => ({}),
      poll: async ({ state }) => ({ items: [], nextState: state }),
    });

    const config = trigger.create({});
    const reqs = config.getCredentialRequirements();

    expect(reqs).toHaveLength(1);
    expect(reqs[0]?.slotKey).toBe("auth");
    expect(reqs[0]?.acceptedTypes).toContain("my-cred-type-id");
  });

  it("inspectorSummary() forwards rows from the inspectorSummary option to the runtime config", () => {
    const trigger = definePollingTrigger<
      "test.inspect",
      Readonly<{ mailbox: string; pollIntervalMs: number }>,
      Record<string, unknown>,
      undefined
    >({
      key: "test.inspect",
      title: "Inspectable polling trigger",
      input: { mailbox: "me", pollIntervalMs: 30_000 },
      initialState: () => ({}),
      inspectorSummary({ config }) {
        return [
          { label: "Mailbox", value: config.mailbox },
          { label: "Poll", value: `${config.pollIntervalMs / 1000}s` },
        ];
      },
      poll: async ({ state }) => ({ items: [], nextState: state }),
    });

    const config = trigger.create({ mailbox: "ops@example.com", pollIntervalMs: 60_000 });

    expect(config.inspectorSummary?.()).toEqual([
      { label: "Mailbox", value: "ops@example.com" },
      { label: "Poll", value: "60s" },
    ]);
  });

  it("inspectorSummary() returns undefined when the option is not provided", () => {
    const trigger = definePollingTrigger({
      key: "test.no-inspect",
      title: "No inspect",
      initialState: () => ({}),
      poll: async ({ state }) => ({ items: [], nextState: state }),
    });

    const config = trigger.create({});
    expect(config.inspectorSummary?.()).toBeUndefined();
  });

  it("round-trip: setup() delegates to PollingTriggerRuntime, emits items, and persists wrapped state", async () => {
    interface CountState {
      count: number;
    }

    const emittedJsonPayloads: unknown[] = [];
    const repo = new InMemoryTriggerSetupStateRepository();
    const pollingRuntime = makeRuntime(repo);
    const trigger = makeTrigger("wf-rt-1", "n-rt-1");

    const defined = definePollingTrigger({
      key: "test.setup-roundtrip",
      title: "Setup roundtrip",
      initialState: (): CountState => ({ count: 0 }),
      pollIntervalMs: 60_000,
      poll: async ({ state }) => ({
        items: [{ json: { tick: state.count }, dedupKey: `tick-${state.count}` }],
        nextState: { count: state.count + 1 },
      }),
    });

    const config = defined.create({});

    // Instantiate the synthesised runtime class directly from the config's type token
    const RuntimeClass = config.type as new () => {
      setup(ctx: unknown): Promise<unknown>;
    };
    const runtimeInstance = new RuntimeClass();

    // Build a minimal TriggerSetupContext that wires ctx.polling.start to the real runtime
    const setupCtx = {
      trigger,
      config,
      previousState: undefined,
      registerCleanup: () => {},
      emit: async (items: unknown[]) => {
        for (const item of items) {
          emittedJsonPayloads.push((item as { json: unknown }).json);
        }
      },
      getCredential: async () => undefined,
      now: () => new Date(),
      runId: "r1",
      workflowId: "wf-rt-1",
      nodeId: "n-rt-1",
      activationId: "a1",
      subworkflowDepth: 0,
      engineMaxNodeActivations: 1000,
      engineMaxSubworkflowDepth: 10,
      data: {},
      binary: {},
      telemetry: {},
      polling: {
        dedup: { merge: (a: string[], b: string[]) => [...new Set([...a, ...b])] },
        start: (args: {
          intervalMs: number;
          seedState?: unknown;
          runCycle: (cycleCtx: {
            previousState: unknown;
            signal: AbortSignal;
          }) => Promise<{ items: unknown[]; nextState: unknown }>;
        }) => {
          return pollingRuntime.start({
            trigger,
            intervalMs: args.intervalMs,
            seedState: args.seedState,
            runCycle: args.runCycle as never,
            emit: setupCtx.emit as never,
          });
        },
      },
    };

    // Call the real setup method
    await runtimeInstance.setup(setupCtx);

    // First cycle should have emitted { tick: 0 }
    expect(emittedJsonPayloads).toHaveLength(1);
    expect(emittedJsonPayloads[0]).toEqual({ tick: 0 });

    // Persisted state should be the wrapped shape with userState + seenKeys
    const persisted = await repo.load(trigger);
    expect(persisted).toBeDefined();
    const state = persisted!.state as { userState: CountState; seenKeys: string[] };
    expect(state.userState).toEqual({ count: 1 });
    expect(state.seenKeys).toContain("tick-0");

    await pollingRuntime.stop(trigger);
  });

  it("round-trip dedup: helper's internal dedupKey window prevents duplicate emissions across ticks", async () => {
    // poll always returns the same two items with the same dedupKeys
    const defined = definePollingTrigger({
      key: "test.internal-dedup",
      title: "Internal dedup",
      initialState: () => ({}),
      pollIntervalMs: 25,
      poll: async ({ state }) => ({
        items: [
          { json: { id: "a" }, dedupKey: "a" },
          { json: { id: "b" }, dedupKey: "b" },
        ],
        nextState: state,
      }),
    });

    const emittedJsonPayloads: unknown[] = [];
    const repo = new InMemoryTriggerSetupStateRepository();
    const pollingRuntime = makeRuntime(repo);
    const trigger = makeTrigger("wf-dd-1", "n-dd-1");

    const config = defined.create({});
    const RuntimeClass = config.type as new () => { setup(ctx: unknown): Promise<unknown> };
    const runtimeInstance = new RuntimeClass();

    // We'll capture the runCycle and call it manually for controlled tick count
    let capturedRunCycle:
      | ((cycleCtx: {
          previousState: unknown;
          signal: AbortSignal;
        }) => Promise<{ items: unknown[]; nextState: unknown }>)
      | undefined;
    let capturedSeedState: unknown;

    const setupCtx = {
      trigger,
      config,
      previousState: undefined,
      registerCleanup: () => {},
      emit: async (items: unknown[]) => {
        for (const item of items) {
          emittedJsonPayloads.push((item as { json: unknown }).json);
        }
      },
      getCredential: async () => undefined,
      now: () => new Date(),
      runId: "r2",
      workflowId: "wf-dd-1",
      nodeId: "n-dd-1",
      activationId: "a2",
      subworkflowDepth: 0,
      engineMaxNodeActivations: 1000,
      engineMaxSubworkflowDepth: 10,
      data: {},
      binary: {},
      telemetry: {},
      polling: {
        dedup: { merge: (a: string[], b: string[]) => [...new Set([...a, ...b])] },
        start: async (args: {
          intervalMs: number;
          seedState?: unknown;
          runCycle: (cycleCtx: {
            previousState: unknown;
            signal: AbortSignal;
          }) => Promise<{ items: unknown[]; nextState: unknown }>;
        }) => {
          capturedRunCycle = args.runCycle;
          capturedSeedState = args.seedState;
          // Run first tick immediately (like the real runtime does)
          const result = await args.runCycle({
            previousState: capturedSeedState,
            signal: new AbortController().signal,
          });
          // Emit if items
          if ((result.items as unknown[]).length > 0) {
            await setupCtx.emit(result.items as unknown[]);
          }
          // Store state for next tick
          capturedSeedState = result.nextState;
          return result.nextState;
        },
      },
    };

    // First tick
    await runtimeInstance.setup(setupCtx);
    const afterFirstTick = emittedJsonPayloads.length;
    expect(afterFirstTick).toBeGreaterThan(0); // Both a and b emitted

    // Second tick — same dedupKeys, should emit nothing
    if (capturedRunCycle) {
      const result2 = await capturedRunCycle({
        previousState: capturedSeedState,
        signal: new AbortController().signal,
      });
      if ((result2.items as unknown[]).length > 0) {
        await setupCtx.emit(result2.items as unknown[]);
      }
    }

    // No new items should have been emitted on the second tick
    expect(emittedJsonPayloads.length).toBe(afterFirstTick);

    await pollingRuntime.stop(trigger);
  });

  it("dedup: items with the same dedupKey are not emitted twice via poll test seam", async () => {
    const defined = definePollingTrigger({
      key: "test.dedup",
      title: "Dedup test",
      initialState: () => ({ seenIds: [] as string[] }),
      poll: async ({ state }) => {
        const seenIds = state.seenIds;
        const items = [
          { json: { id: "a" }, dedupKey: "a" },
          { json: { id: "b" }, dedupKey: "b" },
        ];
        const newItems = items.filter((item) => !seenIds.includes(item.dedupKey!));
        return {
          items: newItems,
          nextState: { seenIds: [...seenIds, ...newItems.map((i) => i.dedupKey!)] },
        };
      },
    });

    // First poll: both items are new
    const result1 = await defined.poll({ config: {}, state: { seenIds: [] } });
    expect(result1.items).toHaveLength(2);

    // Second poll with updated state: no new items
    const result2 = await defined.poll({ config: {}, state: result1.nextState });
    expect(result2.items).toHaveLength(0);
  });

  it("execute hook is called when provided", async () => {
    let executeCalled = false;

    const defined = definePollingTrigger({
      key: "test.execute-hook",
      title: "Execute hook",
      initialState: () => ({}),
      poll: async ({ state }) => ({ items: [{ json: { x: 1 } }], nextState: state }),
      execute: async (items) => {
        executeCalled = true;
        return { main: items.map((item) => ({ ...item, json: { ...(item.json as object), enriched: true } })) };
      },
    });

    const config = defined.create({});
    const RuntimeClass = config.type as new () => {
      execute(items: unknown[], ctx: unknown): Promise<{ main: unknown[] }>;
    };
    const runtime = new RuntimeClass();

    const items = [{ json: { x: 1 } }];
    const result = await runtime.execute(items, {} as never);

    expect(executeCalled).toBe(true);
    expect((result as { main: unknown[] }).main).toHaveLength(1);
  });

  it("execute hook passes items through when not provided", async () => {
    const defined = definePollingTrigger({
      key: "test.no-execute-hook",
      title: "No execute hook",
      initialState: () => ({}),
      poll: async ({ state }) => ({ items: [{ json: { y: 2 } }], nextState: state }),
    });

    const config = defined.create({});
    const RuntimeClass = config.type as new () => {
      execute(items: unknown[], ctx: unknown): Promise<{ main: unknown[] }>;
    };
    const runtime = new RuntimeClass();

    const items = [{ json: { y: 2 } }];
    const result = await runtime.execute(items, {} as never);
    expect((result as { main: unknown[] }).main).toBe(items);
  });

  it("getTestItems returns empty array when testItems hook is not provided", async () => {
    const defined = definePollingTrigger({
      key: "test.no-test-items",
      title: "No test items",
      initialState: () => ({}),
      poll: async ({ state }) => ({ items: [], nextState: state }),
    });

    const config = defined.create({});
    const RuntimeClass = config.type as new () => { getTestItems(ctx: unknown): Promise<unknown[]> };
    const runtime = new RuntimeClass();

    const items = await runtime.getTestItems({} as never);
    expect(items).toHaveLength(0);
  });

  it("getTestItems calls testItems hook when provided", async () => {
    const defined = definePollingTrigger({
      key: "test.test-items-hook",
      title: "Test items hook",
      initialState: () => ({}),
      poll: async ({ state }) => ({ items: [], nextState: state }),
      testItems: async () => [{ json: { sample: true } }],
    });

    const config = defined.create({});
    const RuntimeClass = config.type as new () => { getTestItems(ctx: unknown): Promise<unknown[]> };
    const runtime = new RuntimeClass();

    const items = await runtime.getTestItems({} as never);
    expect(items).toHaveLength(1);
    expect((items[0] as { json: unknown }).json).toEqual({ sample: true });
  });

  it("register() adds the runtime class to the node resolver context", () => {
    const registered: unknown[] = [];
    const defined = definePollingTrigger({
      key: "test.register",
      title: "Register test",
      initialState: () => ({}),
      poll: async ({ state }) => ({ items: [], nextState: state }),
    });

    defined.register({
      registerNode: (token) => {
        registered.push(token);
      },
    });

    expect(registered).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // Credential binding shape coverage (object-form, array-of-types, label/help)
  // -------------------------------------------------------------------------

  it("getCredentialRequirements supports object-form bindings (single type, label, helpText, helpUrl, optional)", () => {
    const trigger = definePollingTrigger({
      key: "test.cred-object-form",
      title: "Cred object form",
      credentials: {
        auth: {
          type: "test.api-key",
          label: "Custom auth label",
          helpText: "Bind a test API key here",
          helpUrl: "https://example.com/docs",
          optional: true,
        },
      },
      initialState: () => ({}),
      poll: async () => ({ items: [] }),
    });
    const reqs = trigger.create({}).getCredentialRequirements!();

    expect(reqs).toHaveLength(1);
    expect(reqs[0]).toEqual({
      slotKey: "auth",
      label: "Custom auth label",
      acceptedTypes: ["test.api-key"],
      optional: true,
      helpText: "Bind a test API key here",
      helpUrl: "https://example.com/docs",
    });
  });

  it("getCredentialRequirements supports array-of-types bindings (humanizes slotKey when label omitted)", () => {
    const trigger = definePollingTrigger({
      key: "test.cred-array-types",
      title: "Cred array types",
      credentials: {
        primary_auth_slot: {
          type: ["type-a", "type-b"],
        },
      },
      initialState: () => ({}),
      poll: async () => ({ items: [] }),
    });
    const reqs = trigger.create({}).getCredentialRequirements!();

    expect(reqs).toHaveLength(1);
    expect(reqs[0]).toEqual({
      slotKey: "primary_auth_slot",
      label: "Primary auth slot",
      acceptedTypes: ["type-a", "type-b"],
      optional: undefined,
      helpText: undefined,
      helpUrl: undefined,
    });
  });

  // -------------------------------------------------------------------------
  // Credential accessor: poll receives credentials.<slot>() async getters
  // -------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // setup() coverage: intervalMs resolution + seedWrapped fallback + dedup cap
  // -------------------------------------------------------------------------

  function buildSetupHarness<TItemJson, TState>(
    defined: ReturnType<typeof definePollingTrigger<string, never, TItemJson, TState, undefined>>,
    cfg: Record<string, unknown> = {},
    triggerInstance: TriggerInstanceId = makeTrigger("wf-h", "n-h"),
  ): {
    runtimeInstance: { setup(ctx: unknown): Promise<unknown> };
    setupCtx: Record<string, unknown> & {
      polling: { start: (args: { intervalMs: number; [k: string]: unknown }) => Promise<unknown> };
    };
    capturedIntervals: number[];
    emittedJsonPayloads: unknown[];
    repo: InMemoryTriggerSetupStateRepository;
    pollingRuntime: PollingTriggerRuntime;
  } {
    const emittedJsonPayloads: unknown[] = [];
    const capturedIntervals: number[] = [];
    const repo = new InMemoryTriggerSetupStateRepository();
    const pollingRuntime = makeRuntime(repo);
    const config = defined.create(cfg as never);
    const RuntimeClass = config.type as new () => { setup(ctx: unknown): Promise<unknown> };
    const runtimeInstance = new RuntimeClass();
    const setupCtx = {
      trigger: triggerInstance,
      config,
      previousState: undefined,
      registerCleanup: () => {},
      emit: async (items: unknown[]) => {
        for (const item of items) {
          emittedJsonPayloads.push((item as { json: unknown }).json);
        }
      },
      getCredential: async () => undefined,
      now: () => new Date(),
      runId: "r1",
      workflowId: triggerInstance.workflowId,
      nodeId: triggerInstance.nodeId,
      activationId: "a1",
      subworkflowDepth: 0,
      engineMaxNodeActivations: 1000,
      engineMaxSubworkflowDepth: 10,
      data: {},
      binary: {},
      telemetry: {},
      polling: {
        dedup: { merge: (a: string[], b: string[]) => [...new Set([...a, ...b])] },
        start: (args: {
          intervalMs: number;
          seedState?: unknown;
          runCycle: (cycleCtx: { previousState: unknown; signal: AbortSignal }) => Promise<{
            items: unknown[];
            nextState: unknown;
          }>;
        }) => {
          capturedIntervals.push(args.intervalMs);
          return pollingRuntime.start({
            trigger: triggerInstance,
            intervalMs: args.intervalMs,
            seedState: args.seedState,
            runCycle: args.runCycle as never,
            emit: setupCtx.emit as never,
          });
        },
      },
    };
    return { runtimeInstance, setupCtx, capturedIntervals, emittedJsonPayloads, repo, pollingRuntime };
  }

  it("setup() falls back to DEFAULT_INTERVAL_MS when neither cfg nor options set pollIntervalMs", async () => {
    const defined = definePollingTrigger({
      key: "test.default-interval",
      title: "Default interval",
      poll: async () => ({ items: [] }),
    });
    const trigger = makeTrigger("wf-def", "n-def");
    const h = buildSetupHarness(defined, {}, trigger);
    await h.runtimeInstance.setup(h.setupCtx);
    expect(h.capturedIntervals).toEqual([60_000]);
    await h.pollingRuntime.stop(trigger);
  });

  it("setup() prefers cfg.pollIntervalMs over options.pollIntervalMs", async () => {
    const defined = definePollingTrigger({
      key: "test.cfg-interval-wins",
      title: "Cfg interval wins",
      pollIntervalMs: 99_999,
      poll: async () => ({ items: [] }),
    });
    const trigger = makeTrigger("wf-cfg-wins", "n-cfg-wins");
    const h = buildSetupHarness(defined, { pollIntervalMs: 5_555 }, trigger);
    await h.runtimeInstance.setup(h.setupCtx);
    expect(h.capturedIntervals).toEqual([5_555]);
    await h.pollingRuntime.stop(trigger);
  });

  it("setup() seeds wrapped state with undefined userState when initialState is not provided", async () => {
    const defined = definePollingTrigger({
      key: "test.no-initial-state",
      title: "No initial state",
      pollIntervalMs: 60_000,
      poll: async ({ state }) => ({
        items: [{ json: { observedState: (state as unknown) ?? null } }],
      }),
    });
    const trigger = makeTrigger("wf-no-init", "n-no-init");
    const h = buildSetupHarness(defined, {}, trigger);
    await h.runtimeInstance.setup(h.setupCtx);
    expect(h.emittedJsonPayloads).toHaveLength(1);
    expect((h.emittedJsonPayloads[0] as { observedState: unknown }).observedState).toBeNull();
    await h.pollingRuntime.stop(trigger);
  });

  it("setup() resumes from existing wrapped state when previousState is supplied", async () => {
    const defined = definePollingTrigger({
      key: "test.resume-state",
      title: "Resume state",
      pollIntervalMs: 60_000,
      initialState: () => ({ count: 0 }),
      poll: async ({ state }) => ({
        items: [{ json: { observedCount: (state as { count: number }).count } }],
        nextState: { count: (state as { count: number }).count + 1 },
      }),
    });
    const trigger = makeTrigger("wf-resume", "n-resume");
    const h = buildSetupHarness(defined, {}, trigger);

    // Seed the harness with previously-persisted wrapped state — exercises the
    // `existingWrapped ? persisted : undefined` true branch + `previousState ?? seedWrapped` LHS.
    (h.setupCtx as { previousState: unknown }).previousState = {
      userState: { count: 7 },
      seenKeys: ["already-seen"],
    };

    await h.runtimeInstance.setup(h.setupCtx);
    expect(h.emittedJsonPayloads).toHaveLength(1);
    expect((h.emittedJsonPayloads[0] as { observedCount: number }).observedCount).toBe(7);
    await h.pollingRuntime.stop(trigger);
  });

  it("setup() caps the dedup window at 2000 keys to bound persisted state size", async () => {
    const defined = definePollingTrigger({
      key: "test.dedup-cap",
      title: "Dedup cap",
      pollIntervalMs: 60_000,
      poll: async () => ({
        items: Array.from({ length: 2100 }, (_, i) => ({ json: { idx: i }, dedupKey: `key-${i}` })),
      }),
    });
    const trigger = makeTrigger("wf-cap", "n-cap");
    const h = buildSetupHarness(defined, {}, trigger);
    await h.runtimeInstance.setup(h.setupCtx);
    const persisted = await h.repo.load(trigger);
    const state = persisted?.state as { seenKeys: string[] };
    expect(state.seenKeys).toHaveLength(2000);
    expect(state.seenKeys[0]).toBe("key-100");
    expect(state.seenKeys[1999]).toBe("key-2099");
    await h.pollingRuntime.stop(trigger);
  });

  it("poll() forwards declared credential accessors when caller supplies them", async () => {
    const trigger = definePollingTrigger({
      key: "test.cred-accessor",
      title: "Cred accessor",
      credentials: { auth: "test.api-key" },
      initialState: () => ({}),
      poll: async ({ credentials }) => {
        const session = await credentials.auth();
        return { items: [{ json: { session } }] };
      },
    });

    const result = await trigger.poll({
      config: {},
      state: {},
      credentials: { auth: async () => ({ token: "token-for-auth" }) },
    });
    expect(result.items).toHaveLength(1);
    expect((result.items[0] as { json: { session: { token: string } } }).json.session.token).toBe("token-for-auth");
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTrigger(workflowId: string, nodeId: string): TriggerInstanceId {
  return { workflowId, nodeId };
}
