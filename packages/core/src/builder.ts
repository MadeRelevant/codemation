import type {
InputPortKey,
NodeConfigBase,
NodeDefinition,
NodeRef,
OutputPortKey,
RunnableNodeOutputJson,
TriggerNodeOutputJson,
WorkflowDefinition,
WorkflowId
} from "./types";

import { ChainCursor } from "./ChainCursor";
import type { AnyRunnableNodeConfig,AnyTriggerNodeConfig } from "./workflowBuilderTypes";

export class WorkflowBuilder {
  private readonly nodes: NodeDefinition[] = [];
  private readonly edges: WorkflowDefinition["edges"] = [];
  private seq = 0;

  constructor(
    private readonly meta: { id: WorkflowId; name: string },
    private readonly options?: Readonly<{
      makeMergeNode?: (name: string) => AnyRunnableNodeConfig;
    }>,
  ) {}

  private add(config: NodeConfigBase): NodeRef {
    const tokenName = typeof config.type === "function" ? config.type.name : String(config.type);
    const id = config.id ?? `${tokenName}:${++this.seq}`;
    this.nodes.push({ id, kind: config.kind, type: config.type, name: config.name, config });
    return { id, kind: config.kind, name: config.name };
  }

  private connect(from: NodeRef, to: NodeRef, fromOutput: OutputPortKey = "main", toInput: InputPortKey = "in"): void {
    this.edges.push({ from: { nodeId: from.id, output: fromOutput }, to: { nodeId: to.id, input: toInput } });
  }

  trigger<TConfig extends AnyTriggerNodeConfig>(config: TConfig): ChainCursor<TriggerNodeOutputJson<TConfig>> {
    const ref = this.add(config);
    return new ChainCursor<TriggerNodeOutputJson<TConfig>>(this, ref, "main");
  }

  start<TConfig extends AnyRunnableNodeConfig>(config: TConfig): ChainCursor<RunnableNodeOutputJson<TConfig>> {
    const ref = this.add(config);
    return new ChainCursor<RunnableNodeOutputJson<TConfig>>(this, ref, "main");
  }

  build(): WorkflowDefinition {
    return { ...this.meta, nodes: this.nodes, edges: this.edges };
  }
}

export { ChainCursor } from "./ChainCursor";
export { WhenBuilder } from "./WhenBuilder";
