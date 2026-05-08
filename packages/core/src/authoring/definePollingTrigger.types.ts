/**
 * definePollingTrigger — declarative helper for authoring polling triggers.
 *
 * Mirrors the ergonomics of `defineNode` / `defineRestNode` / `defineCredential`.
 * Plugin authors supply a `poll` function plus metadata; the helper synthesises the
 * two internal classes (`DefinedPollingTriggerRuntime` + `DefinedPollingTriggerConfig`)
 * that the engine's trigger machinery requires. Internal classes, DI annotations, and
 * `PollingTriggerRuntime` wiring are hidden from the plugin-author surface entirely.
 */
import type {
  Items,
  JsonValue,
  NodeExecutionContext,
  NodeInspectorSummaryRow,
  NodeOutputs,
  TestableTriggerNode,
  TriggerNodeConfig,
  TriggerSetupContext,
  TriggerTestItemsContext,
  TypeToken,
} from "..";
import type { CredentialJsonRecord, CredentialRequirement } from "../contracts/credentialTypes";
import type { DefinedNodeCredentialAccessors, DefinedNodeCredentialBindings } from "./defineNode.types";
import { node as persistedNode } from "../runtime-types/runtimeTypeDecorators.types";
import {
  definedNodeCredentialRequirementFactory,
  definedNodeCredentialAccessorFactory,
} from "./definePollingTriggerInternals";
import type { ZodType } from "zod";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

type MaybePromise<TValue> = TValue | Promise<TValue>;

/**
 * Context passed into the `poll` callback on each tick.
 */
export interface DefinePollingTriggerPollContext<
  TConfig extends CredentialJsonRecord,
  TState extends JsonValue | undefined,
  TBindings extends DefinedNodeCredentialBindings | undefined,
> {
  readonly config: TConfig;
  readonly state: TState;
  readonly credentials: DefinedNodeCredentialAccessors<TBindings>;
}

/**
 * What `poll` must return each tick.
 */
export interface DefinePollingTriggerPollResult<TItemJson, TState extends JsonValue | undefined> {
  /**
   * New items to emit. Each item may carry an optional `dedupKey`; duplicate keys are
   * filtered out against a rolling dedup window (managed internally by the runtime).
   * Items without a `dedupKey` are always emitted.
   */
  readonly items: ReadonlyArray<{ json: TItemJson; dedupKey?: string }>;
  /** Persisted as the trigger's setup state for the next tick. */
  readonly nextState: TState;
}

/**
 * Context passed into the `execute` callback for post-emit enrichment (e.g. fetching
 * attachment bytes). Mirrors `NodeExecutionContext` so plugin authors use familiar patterns.
 */
export type DefinePollingTriggerExecuteContext<TConfig extends TriggerNodeConfig<any, any>> =
  NodeExecutionContext<TConfig>;

/**
 * Context passed into the `testItems` callback.
 */
export type DefinePollingTriggerTestItemsContext<TConfig extends TriggerNodeConfig<any, any>> =
  TriggerTestItemsContext<TConfig>;

/**
 * Options accepted by `definePollingTrigger`.
 */
export interface DefinePollingTriggerOptions<
  TKey extends string,
  TConfig extends CredentialJsonRecord,
  TItemJson,
  TState extends JsonValue | undefined,
  TBindings extends DefinedNodeCredentialBindings | undefined = undefined,
> {
  /**
   * Unique node-token-id-style key, e.g. `"msgraph-mail.on-new-mail"`.
   * Used as the persisted runtime type name — must be stable across deployments.
   */
  readonly key: TKey;
  readonly title: string;
  readonly description?: string;
  /** Canvas icon (same contract as `NodeConfigBase.icon`). */
  readonly icon?: string;
  /**
   * Zod schema for the trigger's user-facing configuration.
   * When provided, the returned `create()` method is typed against the inferred config type.
   */
  readonly configSchema?: ZodType<TConfig>;
  /** Credential bindings keyed by slot (same format as `defineNode`). */
  readonly credentials?: TBindings;
  /**
   * Static configuration summary surfaced in the workflow inspector — see
   * {@link import("../contracts/workflowTypes").NodeConfigBase.inspectorSummary}.
   *
   * Receives the static config; returns 2–6 short label/value pairs (or `undefined` to skip).
   */
  readonly inspectorSummary?: (
    args: Readonly<{ config: TConfig }>,
  ) => ReadonlyArray<NodeInspectorSummaryRow> | undefined;
  /**
   * Called once when the trigger arms (or re-arms after a server restart) to provide the
   * initial value for `state` when no persisted state exists.
   */
  initialState?(): TState;
  /**
   * Polling interval in milliseconds. The runtime enforces a minimum of 25 ms.
   * @default 60_000
   */
  readonly pollIntervalMs?: number;
  /**
   * The per-tick poll logic. Called by the runtime each interval.
   * Must return new items plus the next persisted state.
   */
  poll(
    pollCtx: DefinePollingTriggerPollContext<TConfig, TState, TBindings>,
  ): MaybePromise<DefinePollingTriggerPollResult<TItemJson, TState>>;
  /**
   * Optional post-emit enrichment step (runs in the normal node-execute phase after the
   * trigger fires and the workflow run starts). Use for expensive per-item work such as
   * fetching attachment bytes via `ctx.binary.attach`. When omitted, the trigger passes
   * items through unchanged.
   */
  execute?(
    items: Items<TItemJson>,
    ctx: NodeExecutionContext<DefinedPollingTriggerConfig<TConfig, TItemJson>>,
  ): MaybePromise<NodeOutputs>;
  /**
   * Optional implementation for the workflow UI's "Test" button. Should return a small
   * sample of current items without consulting or mutating polling state.
   */
  testItems?(
    ctx: TriggerTestItemsContext<DefinedPollingTriggerConfig<TConfig, TItemJson>>,
  ): MaybePromise<Items<TItemJson>>;
}

// ---------------------------------------------------------------------------
// DefinedPollingTrigger (returned object)
// ---------------------------------------------------------------------------

/**
 * The object returned by `definePollingTrigger`. Register it via
 * `definePlugin({ nodes: [myTrigger] })` or call `.register(ctx)` directly.
 *
 * `poll` is also directly callable for unit-testing — no runtime needed.
 */
export interface DefinedPollingTrigger<
  TKey extends string,
  TConfig extends CredentialJsonRecord,
  TItemJson,
  TState extends JsonValue | undefined,
  TBindings extends DefinedNodeCredentialBindings | undefined = undefined,
> {
  readonly kind: "defined-polling-trigger";
  readonly key: TKey;
  readonly title: string;
  readonly description?: string;
  /**
   * Create the trigger config for use in workflow definitions.
   * @param cfg - User-facing trigger configuration.
   * @param name - Display name (defaults to `title`).
   * @param id - Optional stable node id.
   */
  create(cfg: TConfig, name?: string, id?: string): DefinedPollingTriggerConfig<TConfig, TItemJson>;
  /**
   * Test seam: call `poll` directly without starting the runtime.
   * Returns `{ items, nextState }` just like the real runtime receives.
   */
  poll(
    pollCtx: Omit<DefinePollingTriggerPollContext<TConfig, TState, TBindings>, "credentials"> & {
      credentials?: DefinedNodeCredentialAccessors<TBindings>;
    },
  ): MaybePromise<DefinePollingTriggerPollResult<TItemJson, TState>>;
  /** Registers the synthesised runtime class with the plugin container. */
  register(context: { registerNode<TValue>(token: TypeToken<TValue>, implementation?: TypeToken<TValue>): void }): void;
}

// ---------------------------------------------------------------------------
// DefinedPollingTriggerConfig (TriggerNodeConfig shape for the engine)
// ---------------------------------------------------------------------------

/**
 * TriggerNodeConfig produced by `DefinedPollingTrigger.create(...)`.
 * Holds user configuration and credential requirements for the engine.
 * The setup state type is opaque `JsonValue | undefined` — the runtime
 * uses an internal wrapped shape that plugin authors never see.
 */
export class DefinedPollingTriggerConfig<TConfig extends CredentialJsonRecord, TItemJson> implements TriggerNodeConfig<
  TItemJson,
  JsonValue | undefined
> {
  readonly kind = "trigger" as const;
  readonly type: TypeToken<unknown>;
  readonly icon: string | undefined;

  constructor(
    public readonly name: string,
    public readonly cfg: TConfig,
    typeToken: TypeToken<unknown>,
    icon: string | undefined,
    private readonly credentialRequirements: ReadonlyArray<CredentialRequirement>,
    public readonly id?: string,
    private readonly inspectorSummaryFn?: (
      args: Readonly<{ config: TConfig }>,
    ) => ReadonlyArray<NodeInspectorSummaryRow> | undefined,
  ) {
    this.type = typeToken;
    this.icon = icon;
  }

  getCredentialRequirements(): ReadonlyArray<CredentialRequirement> {
    return this.credentialRequirements;
  }

  inspectorSummary(): ReadonlyArray<NodeInspectorSummaryRow> | undefined {
    return this.inspectorSummaryFn?.({ config: this.cfg });
  }
}

// ---------------------------------------------------------------------------
// Internal wrapped state helpers
// ---------------------------------------------------------------------------

/** Opaque shape stored in the trigger setup state repository. @internal */
interface InternalWrappedState {
  readonly userState: JsonValue | undefined;
  readonly seenKeys: ReadonlyArray<string>;
}

function isWrappedState(value: unknown): value is InternalWrappedState {
  return (
    value !== null &&
    typeof value === "object" &&
    "seenKeys" in (value as Record<string, unknown>) &&
    Array.isArray((value as InternalWrappedState).seenKeys)
  );
}

// ---------------------------------------------------------------------------
// Implementation factory
// ---------------------------------------------------------------------------

/**
 * Declarative helper for authoring polling triggers.
 *
 * ```ts
 * export const onNewMail = definePollingTrigger({
 *   key: "my-plugin.on-new-mail",
 *   title: "On new mail",
 *   configSchema: z.object({ folder: z.string() }),
 *   credentials: { auth: myOAuthCredentialType },
 *   initialState: () => ({ lastSeenId: undefined }),
 *   pollIntervalMs: 60_000,
 *   async poll({ config, state, credentials }) {
 *     const session = await credentials.auth();
 *     const messages = await fetchMessages(session, config.folder, state.lastSeenId);
 *     return {
 *       items: messages.map(m => ({ json: m, dedupKey: m.id })),
 *       nextState: { lastSeenId: messages[0]?.id ?? state.lastSeenId },
 *     };
 *   },
 * });
 * ```
 */
export function definePollingTrigger<
  TKey extends string,
  TConfig extends CredentialJsonRecord,
  TItemJson,
  TState extends JsonValue | undefined,
  TBindings extends DefinedNodeCredentialBindings | undefined = undefined,
>(
  options: DefinePollingTriggerOptions<TKey, TConfig, TItemJson, TState, TBindings>,
): DefinedPollingTrigger<TKey, TConfig, TItemJson, TState, TBindings> {
  const credentialRequirements = definedNodeCredentialRequirementFactory.create(options.credentials);
  const DEFAULT_INTERVAL_MS = 60_000;

  type TConfig_ = DefinedPollingTriggerConfig<TConfig, TItemJson>;

  // ---------------------------------------------------------------------------
  // Synthesised runtime class (implements TestableTriggerNode)
  // ---------------------------------------------------------------------------

  const DefinedPollingTriggerRuntime = class implements TestableTriggerNode<TConfig_> {
    readonly kind = "trigger" as const;
    readonly outputPorts = ["main"] as const;

    async setup(ctx: TriggerSetupContext<TConfig_, JsonValue | undefined>): Promise<JsonValue | undefined> {
      const cfg = ctx.config.cfg;
      const intervalMs =
        (cfg as Partial<{ pollIntervalMs: number }>).pollIntervalMs ?? options.pollIntervalMs ?? DEFAULT_INTERVAL_MS;

      // Unwrap previously persisted state, or create the initial wrapped state.
      const persisted = ctx.previousState;
      const existingWrapped: InternalWrappedState | undefined = isWrappedState(persisted) ? persisted : undefined;
      const seedWrapped: InternalWrappedState = existingWrapped ?? {
        userState: options.initialState ? options.initialState() : undefined,
        seenKeys: [],
      };

      const result = await ctx.polling.start<InternalWrappedState, TItemJson>({
        intervalMs,
        seedState: seedWrapped,
        runCycle: async ({ previousState }) => {
          const wrapped: InternalWrappedState = previousState ?? seedWrapped;
          const seenSet = new Set(wrapped.seenKeys);

          const credentialAccessors = definedNodeCredentialAccessorFactory.create(
            options.credentials,
            ctx,
          ) as DefinedNodeCredentialAccessors<TBindings>;

          const pollResult = await options.poll({
            config: cfg,
            state: wrapped.userState as TState,
            credentials: credentialAccessors,
          });

          // Dedup: filter items whose dedupKey is already seen
          const newItems: Array<{ json: TItemJson }> = [];
          const newKeys: string[] = [];
          for (const item of pollResult.items) {
            if (item.dedupKey !== undefined) {
              if (seenSet.has(item.dedupKey)) {
                continue;
              }
              newKeys.push(item.dedupKey);
            }
            newItems.push({ json: item.json });
          }

          // Merge keys, cap the window at 2000 to bound state size
          const allKeys = [...wrapped.seenKeys, ...newKeys];
          const cappedKeys = allKeys.length > 2000 ? allKeys.slice(allKeys.length - 2000) : allKeys;

          const nextWrapped: InternalWrappedState = {
            userState: pollResult.nextState,
            seenKeys: cappedKeys,
          };

          return {
            items: newItems as Items<TItemJson>,
            nextState: nextWrapped,
          };
        },
      });

      return result as JsonValue | undefined;
    }

    async execute(items: Items<TItemJson>, ctx: NodeExecutionContext<TConfig_>): Promise<NodeOutputs> {
      if (options.execute) {
        return await options.execute(items, ctx);
      }
      return { main: items };
    }

    async getTestItems(ctx: TriggerTestItemsContext<TConfig_>): Promise<Items> {
      if (options.testItems) {
        return await options.testItems(ctx);
      }
      return [];
    }
  };

  persistedNode({ name: options.key })(DefinedPollingTriggerRuntime);

  // ---------------------------------------------------------------------------
  // Returned definition object
  // ---------------------------------------------------------------------------

  const definition: DefinedPollingTrigger<TKey, TConfig, TItemJson, TState, TBindings> = {
    kind: "defined-polling-trigger",
    key: options.key,
    title: options.title,
    description: options.description,

    create(cfg: TConfig, name = options.title, id?: string): DefinedPollingTriggerConfig<TConfig, TItemJson> {
      return new DefinedPollingTriggerConfig<TConfig, TItemJson>(
        name,
        cfg,
        DefinedPollingTriggerRuntime,
        options.icon,
        credentialRequirements,
        id,
        options.inspectorSummary as
          | ((args: Readonly<{ config: TConfig }>) => ReadonlyArray<NodeInspectorSummaryRow> | undefined)
          | undefined,
      );
    },

    poll(pollCtx) {
      return options.poll({
        config: pollCtx.config,
        state: pollCtx.state,
        credentials: (pollCtx.credentials ?? {}) as DefinedNodeCredentialAccessors<TBindings>,
      });
    },

    register(context) {
      context.registerNode(DefinedPollingTriggerRuntime);
    },
  };

  return definition;
}
