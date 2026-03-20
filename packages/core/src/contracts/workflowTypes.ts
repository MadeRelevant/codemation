import type { TypeToken } from "../di";
import type { CredentialRequirement } from "./credentialTypes";

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

export interface WorkflowDefinition {
  id: WorkflowId;
  name: string;
  nodes: NodeDefinition[];
  edges: Edge[];
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
