import type {
  Duration,
  ExecutionContext,
  HumanTaskActor,
  HumanTaskHandle,
  HumanTaskSubject,
  NodeExecutionContext,
  ResumeContext,
} from "../contracts/runtimeTypes";
import type { Item, JsonValue, NodeInspectorSummaryRow, NodeConfigBase } from "../contracts/workflowTypes";
import type { CredentialJsonRecord } from "../contracts/credentialTypes";
import type { ZodObject, ZodType } from "zod";
import type { DefinedNodeCredentialBindings } from "./defineNode.types";
import { SuspensionRequest } from "../contracts/runtimeTypes";
import { defineNode } from "./defineNode.types";
import type { DefinedNode } from "./defineNode.types";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Decision shape merged into `item.json` after a HITL approval task resolves.
 *
 * - `"approved"` / `"rejected"` — from a human decision (uses `approvedPredicate`).
 * - `"timed-out"` — timeout fired with `onTimeout: "halt"`.
 * - `"auto-accepted"` — timeout fired with `onTimeout: "auto-accept"`.
 */
export interface HumanApprovalDecisionResult {
  readonly status: "approved" | "rejected" | "timed-out" | "auto-accepted";
  /** Identity of the person who decided; absent for automated outcomes. */
  readonly actor?: HumanTaskActor;
  /** ISO 8601 timestamp of the decision. */
  readonly decidedAt?: Date;
  /** Optional free-text note from the reviewer. */
  readonly note?: string;
  /**
   * Full raw decision payload (only present for `"approved"` / `"rejected"`).
   * Shape is determined by the channel's `decisionSchema`.
   */
  readonly payload?: Record<string, unknown>;
}

/**
 * Output item shape emitted by a `defineHumanApprovalNode`-based node.
 * Original `item.json` fields are preserved and `decision` is merged in.
 * If the input `item.json` already contained a `decision` key it is **overwritten**.
 */
export type HumanApprovalOutputJson<TInputJson extends Record<string, unknown>> = TInputJson & {
  readonly decision: HumanApprovalDecisionResult;
};

/**
 * Extends {@link DefinedNode} with the `humanApprovalToolBehavior` metadata marker.
 * Story 10 reads this field when attaching the node as an agent tool.
 */
export interface DefinedHumanApprovalNode<
  TKey extends string,
  TConfig extends CredentialJsonRecord,
  TInputJson extends Record<string, unknown>,
  TBindings extends DefinedNodeCredentialBindings | undefined = undefined,
> extends DefinedNode<TKey, TConfig, TInputJson, HumanApprovalOutputJson<TInputJson>, TBindings> {
  /**
   * Behavior hint consumed by the agent runtime (story 10) when this node is attached as a tool.
   * `"return"` (default) — return the rejection to the agent as a tool result.
   * `"halt"` — halt the agent run on rejection.
   *
   * Standalone DSL usage ignores this field.
   */
  readonly humanApprovalToolBehavior: { onRejected: "return" | "halt" };
}

// ---------------------------------------------------------------------------
// isHumanApprovalNode predicate
// ---------------------------------------------------------------------------

/**
 * Returns `true` when `node` was created by {@link defineHumanApprovalNode}.
 * Uses the `humanApprovalToolBehavior` typed field as the discriminant.
 */
export function isHumanApprovalNode(
  node: unknown,
): node is DefinedHumanApprovalNode<string, Record<string, unknown>, Record<string, unknown>, undefined> {
  return (
    typeof node === "object" &&
    node !== null &&
    "humanApprovalToolBehavior" in node &&
    typeof (node as { humanApprovalToolBehavior: unknown }).humanApprovalToolBehavior === "object"
  );
}

// ---------------------------------------------------------------------------
// defineHumanApprovalNode
// ---------------------------------------------------------------------------

/**
 * Authoring helper that compiles a HITL approval channel down to a regular
 * {@link defineNode}-backed node with `SuspensionRequest` semantics.
 *
 * **Fast-forward decision semantics (D2):**
 * - On the first `execute` call (no `ctx.resumeContext`): throws a `SuspensionRequest`
 *   that calls the author's `deliver`. The engine persists the suspension and continues.
 * - On resume (`ctx.resumeContext` set): calls `onDecision`/`onTimeout` as appropriate,
 *   merges a `decision` key into `item.json`, and returns an item with the original
 *   `binary` map passed by reference (no copy).
 *
 * **Output shape per item:**
 * ```ts
 * // Input:  { json: { invoiceId: 42 }, binary?: {...} }
 * // Output: { json: { invoiceId: 42, decision: { status: "approved", actor, decidedAt } }, binary: <unchanged> }
 * ```
 * If `item.json` already has a `decision` key it is **overwritten**. Namespace as
 * needed if your schema reserves that key for another purpose.
 *
 * **Predicate persistence (D4 option c):**
 * The `approvedPredicate` function is NOT serialized to the suspension record (except
 * as an audit-only string via `toString()`). On resume, the workflow definition is
 * reloaded from code at process start and the predicate closure is rebuilt naturally.
 * If a deploy ships a changed predicate between suspend and resume, the *new* predicate
 * runs — document this in your runbook when the predicate carries business logic that
 * may change across deploys.
 *
 * @example
 * ```ts
 * export const slackApprovalNode = defineHumanApprovalNode({
 *   key: "my-plugin.slackApproval",
 *   title: "Slack Approval",
 *   channel: "slack",
 *   configSchema: z.object({ channel: z.string(), message: z.string() }),
 *   decisionSchema: z.object({ approved: z.boolean(), note: z.string().optional() }),
 *
 *   async deliver({ task, config, item }, ctx) {
 *     const ts = await postSlackMessage(config.channel, `Approve? <${task.resumeUrl}>`);
 *     return { channel: config.channel, ts };
 *   },
 *
 *   async onDecision({ decision, actor, delivery }, ctx) {
 *     await updateSlackMessage(delivery.channel, delivery.ts, decision.approved ? "✅" : "❌");
 *   },
 * });
 * ```
 */
export function defineHumanApprovalNode<
  TKey extends string,
  TConfig extends CredentialJsonRecord,
  TInputJson extends Record<string, unknown>,
  TDecision extends Record<string, unknown>,
  TDelivery extends JsonValue,
  TBindings extends DefinedNodeCredentialBindings | undefined = undefined,
>(opts: {
  key: TKey;
  title: string;
  description?: string;
  icon?: string;
  channel: string;

  configSchema: ZodType<TConfig>;
  inputSchema?: ZodType<TInputJson>;
  decisionSchema: ZodType<TDecision>;
  credentials?: TBindings;

  /**
   * Custom predicate that decides whether a decision counts as "approved".
   * When omitted, the helper checks if `decisionSchema` is a Zod object with an
   * `approved: boolean` field; if so it uses `decision.approved === true`.
   * If neither holds, `defineHumanApprovalNode` throws at **definition time** (not runtime).
   */
  approvedPredicate?: (decision: TDecision) => boolean;
  /** Default suspension timeout. Defaults to `"24h"`. */
  defaultTimeout?: Duration;
  /** What to do when the task times out. Defaults to `"halt"`. */
  defaultOnTimeout?: "halt" | "auto-accept";

  inspectorSummary?: (config: TConfig) => ReadonlyArray<NodeInspectorSummaryRow> | undefined;

  deliver: (
    args: {
      task: HumanTaskHandle;
      config: TConfig;
      input: TInputJson;
      item: Item;
    },
    ctx: ExecutionContext,
  ) => Promise<TDelivery>;

  onDecision?: (
    args: {
      decision: TDecision;
      actor: HumanTaskActor;
      task: HumanTaskHandle;
      delivery: TDelivery;
      item: Item;
    },
    ctx: ExecutionContext,
  ) => Promise<void>;

  onTimeout?: (
    args: {
      task: HumanTaskHandle;
      delivery: TDelivery;
      item: Item;
      policy: "halt" | "auto-accept";
    },
    ctx: ExecutionContext,
  ) => Promise<void>;
}): DefinedHumanApprovalNode<TKey, TConfig, TInputJson, TBindings> {
  // Resolve the approved predicate at definition time so we throw early when
  // the schema is ambiguous.
  const resolvedPredicate = resolveApprovedPredicate(opts.decisionSchema, opts.approvedPredicate);

  const timeout = opts.defaultTimeout ?? "24h";
  const onTimeout = opts.defaultOnTimeout ?? "halt";

  // TOutputJson is `unknown` here because `execute` returns an Item-shaped object
  // that the engine's NodeOutputNormalizer converts to the proper output. The public
  // interface's DefinedHumanApprovalNode carries the correct output type for DSL use.
  const inner = defineNode<TKey, TConfig, TInputJson, unknown, TBindings>({
    key: opts.key,
    title: opts.title,
    description: opts.description,
    icon: opts.icon,
    configSchema: opts.configSchema,
    inputSchema: opts.inputSchema,
    credentials: opts.credentials,
    inspectorSummary: opts.inspectorSummary ? ({ config }) => opts.inspectorSummary!(config) : undefined,

    async execute(args, { config, execution: ctx }) {
      if (!ctx.resumeContext) {
        // First pass — suspend.
        const subject = buildSubject(opts.title, args.item, ctx);
        throw new SuspensionRequest({
          decisionSchema: opts.decisionSchema,
          timeout,
          onTimeout,
          subject,
          metadata: {
            channel: opts.channel,
            nodeKey: opts.key,
            // Stored for audit only; never re-evaluated. See JSDoc on defineHumanApprovalNode.
            approvedPredicateSource: opts.approvedPredicate?.toString() ?? null,
          },
          deliver: (handle: HumanTaskHandle) =>
            opts.deliver(
              {
                task: handle,
                config,
                input: args.input as TInputJson,
                item: args.item,
              },
              ctx,
            ),
        });
      }

      // Resume pass.
      return await handleResume(
        args.item,
        ctx.resumeContext,
        opts.decisionSchema,
        resolvedPredicate,
        opts.onDecision,
        opts.onTimeout,
        ctx,
      );
    },
  });

  return Object.assign(inner, {
    humanApprovalToolBehavior: { onRejected: "return" as const },
  }) as unknown as DefinedHumanApprovalNode<TKey, TConfig, TInputJson, TBindings>;
}

// ---------------------------------------------------------------------------
// Internal helpers (module-private)
// ---------------------------------------------------------------------------

function resolveApprovedPredicate<TDecision extends Record<string, unknown>>(
  schema: ZodType<TDecision>,
  predicate: ((d: TDecision) => boolean) | undefined,
): (d: TDecision) => boolean {
  if (predicate) {
    return predicate;
  }
  // Zod 4: ZodObject exposes `.shape` directly as an object (not a function).
  const shape = (schema as unknown as ZodObject<Record<string, ZodType>>).shape;
  if (shape && typeof shape === "object" && "approved" in shape) {
    return (d) => (d as { approved?: unknown }).approved === true;
  }
  throw new Error(
    `defineHumanApprovalNode: decisionSchema has no "approved" field and no approvedPredicate was provided. ` +
      `Either add { approved: z.boolean() } to the decision schema or supply approvedPredicate explicitly.`,
  );
}

function buildSubject(title: string, item: Item, ctx: NodeExecutionContext<NodeConfigBase>): HumanTaskSubject {
  return {
    title,
    summary: "",
    attributes: {
      workflowId: ctx.workflowId,
      nodeId: ctx.nodeId,
      item: item.json as JsonValue,
    },
  };
}

function mergeDecision(
  item: Item,
  decision: HumanApprovalDecisionResult,
): { json: Record<string, unknown>; binary: Item["binary"]; meta: Item["meta"] } {
  return {
    json: { ...(item.json as Record<string, unknown>), decision },
    // binary is passed by reference — no copy. See defineHumanApprovalNode JSDoc.
    binary: item.binary,
    meta: item.meta,
  };
}

async function handleResume<TDecision extends Record<string, unknown>, TDelivery extends JsonValue>(
  item: Item,
  resumeContext: ResumeContext,
  decisionSchema: ZodType<TDecision>,
  resolvedPredicate: (d: TDecision) => boolean,
  onDecision:
    | ((
        args: {
          decision: TDecision;
          actor: HumanTaskActor;
          task: HumanTaskHandle;
          delivery: TDelivery;
          item: Item;
        },
        ctx: ExecutionContext,
      ) => Promise<void>)
    | undefined,
  onTimeoutCb:
    | ((
        args: {
          task: HumanTaskHandle;
          delivery: TDelivery;
          item: Item;
          policy: "halt" | "auto-accept";
        },
        ctx: ExecutionContext,
      ) => Promise<void>)
    | undefined,
  ctx: ExecutionContext,
): Promise<{ json: Record<string, unknown>; binary: Item["binary"]; meta: Item["meta"] }> {
  const { decision: dec, delivery, task } = resumeContext;

  if (dec.kind === "timed_out" || dec.kind === "auto_accepted") {
    const policy: "halt" | "auto-accept" = dec.kind === "auto_accepted" ? "auto-accept" : "halt";
    await onTimeoutCb?.({ task, delivery: delivery as TDelivery, item, policy }, ctx);
    const status = dec.kind === "auto_accepted" ? "auto-accepted" : "timed-out";
    return mergeDecision(item, { status, decidedAt: dec.at });
  }

  // dec.kind === "decided"
  const parsed = decisionSchema.parse(dec.value);
  await onDecision?.(
    {
      decision: parsed,
      actor: dec.actor,
      task,
      delivery: delivery as TDelivery,
      item,
    },
    ctx,
  );

  const isApproved = resolvedPredicate(parsed);
  return mergeDecision(item, {
    status: isApproved ? "approved" : "rejected",
    actor: dec.actor,
    decidedAt: dec.decidedAt,
    note: (parsed as { note?: string }).note,
    payload: parsed,
  });
}
