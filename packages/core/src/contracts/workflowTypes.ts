import type { TypeToken } from "../di";
import type { CredentialRequirement } from "./credentialTypes";
import type { RetryPolicySpec } from "./retryPolicySpec.types";

export type WorkflowId = string;
export type NodeId = string;
export type OutputPortKey = string;
export type InputPortKey = string;
export type PersistedTokenId = string;

export type NodeKind = "trigger" | "node";
export type JsonPrimitive = string | number | boolean | null;
export interface JsonObject {
  readonly [key: string]: JsonValue;
}
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;
export type JsonArray = ReadonlyArray<JsonValue>;

export interface Edge {
  from: { nodeId: NodeId; output: OutputPortKey };
  to: { nodeId: NodeId; input: InputPortKey };
}

export type NodeConnectionName = string;

/**
 * Named connection from an executable parent node to child nodes that exist in {@link WorkflowDefinition.nodes}
 * but are not traversed by the main execution graph.
 */
export interface WorkflowNodeConnection {
  readonly parentNodeId: NodeId;
  readonly connectionName: NodeConnectionName;
  readonly childNodeIds: ReadonlyArray<NodeId>;
}

export interface WorkflowDefinition {
  id: WorkflowId;
  name: string;
  nodes: NodeDefinition[];
  edges: Edge[];
  /**
   * Optional metadata: which nodes are connection-owned children (e.g. AI agent `llm` / `tools` slots).
   * When omitted, all nodes in {@link nodes} are treated as executable for topology.
   */
  readonly connections?: ReadonlyArray<WorkflowNodeConnection>;
  /** Directory + file-stem path under a workflow discovery root (for UI grouping only). */
  discoveryPathSegments?: readonly string[];
  /** Retention for run JSON and binaries (seconds). Host/env may supply defaults when omitted. */
  readonly prunePolicy?: WorkflowPrunePolicySpec;
  /** Whether to keep run data after completion. Host/env may supply defaults when omitted. */
  readonly storagePolicy?: WorkflowStoragePolicySpec;
  /** Invoked after a node fails permanently (retries exhausted) and node error handler did not recover. */
  readonly workflowErrorHandler?: WorkflowErrorHandlerSpec;
}

export interface WorkflowGraph {
  next(nodeId: NodeId, output: OutputPortKey): ReadonlyArray<Readonly<{ nodeId: NodeId; input: InputPortKey }>>;
}

export interface WorkflowGraphFactory {
  create(def: WorkflowDefinition): WorkflowGraph;
}

export interface NodeConfigBase {
  readonly kind: NodeKind;
  readonly type: TypeToken<unknown>;
  readonly name?: string;
  readonly id?: NodeId;
  readonly icon?: string;
  readonly execution?: Readonly<{ hint?: "local" | "worker"; queue?: string }>;
  /** In-process execute retries (runnable nodes). Triggers typically omit this. */
  readonly retryPolicy?: RetryPolicySpec;
  /** Recover from execute failures; return outputs to continue, or rethrow to fail the node. */
  readonly nodeErrorHandler?: NodeErrorHandlerSpec;
  /**
   * When true, edges carrying zero items on an output port still schedule single-input downstream nodes.
   * Decided from the **source** node that produced the (empty) output. Default (false/undefined): empty
   * main batches skip downstream execution and propagate the empty path.
   */
  readonly continueWhenEmptyOutput?: boolean;
  getCredentialRequirements?(): ReadonlyArray<CredentialRequirement>;
}

export declare const runnableNodeInputType: unique symbol;
export declare const runnableNodeOutputType: unique symbol;
export declare const triggerNodeOutputType: unique symbol;

export interface RunnableNodeConfig<TInputJson = unknown, TOutputJson = unknown> extends NodeConfigBase {
  readonly kind: "node";
  readonly [runnableNodeInputType]?: TInputJson;
  readonly [runnableNodeOutputType]?: TOutputJson;
}

export declare const triggerNodeSetupStateType: unique symbol;

export interface TriggerNodeConfig<TOutputJson = unknown, TSetupState extends JsonValue | undefined = undefined> extends NodeConfigBase {
  readonly kind: "trigger";
  readonly [triggerNodeOutputType]?: TOutputJson;
  readonly [triggerNodeSetupStateType]?: TSetupState;
}

export type RunnableNodeInputJson<TConfig extends RunnableNodeConfig<any, any>> =
  TConfig extends RunnableNodeConfig<infer TInputJson, any> ? TInputJson : never;

export type RunnableNodeOutputJson<TConfig extends RunnableNodeConfig<any, any>> =
  TConfig extends RunnableNodeConfig<any, infer TOutputJson> ? TOutputJson : never;

export type TriggerNodeOutputJson<TConfig extends TriggerNodeConfig<any, any>> =
  TConfig extends TriggerNodeConfig<infer TOutputJson, any> ? TOutputJson : never;

export type TriggerNodeSetupState<TConfig extends TriggerNodeConfig<any, any>> =
  TConfig extends TriggerNodeConfig<any, infer TSetupState> ? TSetupState : never;

export interface NodeDefinition {
  id: NodeId;
  kind: NodeKind;
  type: TypeToken<unknown>;
  name?: string;
  config: NodeConfigBase;
}

export interface NodeRef {
  id: NodeId;
  kind: NodeKind;
  name?: string;
}

export type PairedItemRef = Readonly<{ nodeId: NodeId; output: OutputPortKey; itemIndex: number }>;

export type BinaryPreviewKind = "image" | "audio" | "video" | "download";

export type BinaryAttachment = Readonly<{
  id: string;
  storageKey: string;
  mimeType: string;
  size: number;
  storageDriver: string;
  previewKind: BinaryPreviewKind;
  createdAt: string;
  runId: RunId;
  workflowId: WorkflowId;
  nodeId: NodeId;
  activationId: NodeActivationId;
  filename?: string;
  sha256?: string;
}>;

export type ItemBinary = Readonly<Record<string, BinaryAttachment>>;

export type Item<TJson = unknown> = Readonly<{
  json: TJson;
  binary?: ItemBinary;
  meta?: Readonly<Record<string, unknown>>;
  paired?: ReadonlyArray<PairedItemRef>;
}>;

export type Items<TJson = unknown> = ReadonlyArray<Item<TJson>>;

export type NodeOutputs = Partial<Record<OutputPortKey, Items>>;

export type RunId = string;
export type NodeActivationId = string;

export interface ParentExecutionRef {
  runId: RunId;
  workflowId: WorkflowId;
  nodeId: NodeId;
  /** Subworkflow depth of the **spawning** run (0 = root). Passed when starting a child run. */
  subworkflowDepth?: number;
  /** Effective max node activations from the parent run (propagated to child policy merge). */
  engineMaxNodeActivations?: number;
  /** Effective max subworkflow depth from the parent run (propagated to child policy merge). */
  engineMaxSubworkflowDepth?: number;
}

export interface RunDataSnapshot {
  getOutputs(nodeId: NodeId): NodeOutputs | undefined;
  getOutputItems(nodeId: NodeId, output?: OutputPortKey): Items;
  getOutputItem(nodeId: NodeId, itemIndex: number, output?: OutputPortKey): Item | undefined;
}

export interface MutableRunData extends RunDataSnapshot {
  setOutputs(nodeId: NodeId, outputs: NodeOutputs): void;
  dump(): Record<NodeId, NodeOutputs>;
}

export interface RunDataFactory {
  create(initial?: Record<NodeId, NodeOutputs>): MutableRunData;
}

export interface RunIdFactory {
  makeRunId(): RunId;
}

export interface ActivationIdFactory {
  makeActivationId(): NodeActivationId;
}

export type UpstreamRefPlaceholder = `$${number}`;
export const branchRef = (index: number) => `$${index}` as UpstreamRefPlaceholder;

export type ExecutionMode = "local" | "worker";

export interface NodeSchedulerDecision {
  mode: ExecutionMode;
  queue?: string;
}

export interface NodeOffloadPolicy {
  decide(args: { workflowId: WorkflowId; nodeId: NodeId; config: NodeConfigBase }): NodeSchedulerDecision;
}

/** Whether to persist run execution data after the workflow finishes. */
export type WorkflowStoragePolicyMode = "ALL" | "SUCCESS" | "ERROR" | "NEVER";

export type WorkflowStoragePolicySpec = WorkflowStoragePolicyMode | TypeToken<WorkflowStoragePolicyResolver>;

export interface WorkflowStoragePolicyResolver {
  shouldPersist(args: WorkflowStoragePolicyDecisionArgs): boolean | Promise<boolean>;
}

export interface WorkflowStoragePolicyDecisionArgs {
  readonly runId: RunId;
  readonly workflowId: WorkflowId;
  readonly workflow: WorkflowDefinition;
  readonly finalStatus: "completed" | "failed";
  readonly startedAt: string;
  readonly finishedAt: string;
}

export interface WorkflowPrunePolicySpec {
  readonly runDataRetentionSeconds?: number;
  readonly binaryRetentionSeconds?: number;
}

export interface PersistedRunPolicySnapshot {
  readonly retentionSeconds?: number;
  readonly binaryRetentionSeconds?: number;
  readonly storagePolicy: WorkflowStoragePolicyMode;
}

export interface WorkflowErrorHandler {
  onError(ctx: WorkflowErrorContext): void | Promise<void>;
}

export interface WorkflowErrorContext {
  readonly runId: RunId;
  readonly workflowId: WorkflowId;
  readonly workflow: WorkflowDefinition;
  readonly failedNodeId: NodeId;
  readonly error: Error;
  readonly startedAt: string;
  readonly finishedAt: string;
}

export type WorkflowErrorHandlerSpec = TypeToken<WorkflowErrorHandler> | WorkflowErrorHandler;

export interface NodeErrorHandlerArgs<TConfig extends NodeConfigBase = NodeConfigBase> {
  readonly kind: "single" | "multi";
  readonly items: Items;
  readonly inputsByPort: Readonly<Record<InputPortKey, Items>> | undefined;
  readonly ctx: import("./runtimeTypes").NodeExecutionContext<TConfig>;
  readonly error: Error;
}

export interface NodeErrorHandler {
  handle<TConfig extends NodeConfigBase>(args: NodeErrorHandlerArgs<TConfig>): Promise<NodeOutputs>;
}

export type NodeErrorHandlerSpec = TypeToken<NodeErrorHandler> | NodeErrorHandler;

/** Runtime defaults when workflow omits prune/storage fields (typically from host env). */
export interface WorkflowPolicyRuntimeDefaults {
  readonly retentionSeconds?: number;
  readonly binaryRetentionSeconds?: number;
  readonly storagePolicy?: WorkflowStoragePolicyMode;
}
