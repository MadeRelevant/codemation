import type {
  InputPortKey,
  NodeConfigBase,
  NodeDefinition,
  NodeRef,
  OutputPortKey,
  RunnableNodeOutputJson,
  TriggerNodeOutputJson,
  WorkflowDefinition,
  WorkflowId,
} from "../../types";

import { AgentConfigInspector } from "../../ai/AgentConfigInspectorFactory";
import { AgentConnectionNodeCollector } from "../../ai/AgentConnectionNodeCollector";
import { ChainCursor } from "./ChainCursorResolver";
import { NodeIdSlugifier } from "./NodeIdSlugifier";
import { WorkflowDefinitionError } from "./WorkflowDefinitionError";
import type { AnyRunnableNodeConfig, AnyTriggerNodeConfig } from "./workflowBuilderTypes";

type NodeIdEntry = Readonly<{
  nodeId: string;
  tokenName: string;
  label: string;
}>;

export class WorkflowBuilder {
  private readonly nodes: NodeDefinition[] = [];
  private readonly edges: WorkflowDefinition["edges"] = [];

  constructor(
    private readonly meta: { id: WorkflowId; name: string },
    private readonly options?: Readonly<Record<string, never>>,
  ) {}

  private add(config: NodeConfigBase): NodeRef {
    const id = config.id ?? NodeIdSlugifier.slugify(config.name ?? "");
    this.nodes.push({ id, kind: config.kind, type: config.type, name: config.name, config });
    return { id, kind: config.kind, name: config.name };
  }

  private connect(from: NodeRef, to: NodeRef, fromOutput: OutputPortKey = "main", toInput: InputPortKey = "in"): void {
    this.edges.push({ from: { nodeId: from.id, output: fromOutput }, to: { nodeId: to.id, input: toInput } });
  }

  trigger<TConfig extends AnyTriggerNodeConfig>(config: TConfig): ChainCursor<TriggerNodeOutputJson<TConfig>> {
    const ref = this.add(config);
    return new ChainCursor<TriggerNodeOutputJson<TConfig>>(this, [{ node: ref, output: "main" }]);
  }

  start<TConfig extends AnyRunnableNodeConfig>(config: TConfig): ChainCursor<RunnableNodeOutputJson<TConfig>> {
    const ref = this.add(config);
    return new ChainCursor<RunnableNodeOutputJson<TConfig>>(this, [{ node: ref, output: "main" }]);
  }

  build(): WorkflowDefinition {
    this.validateNodeIds();
    return { ...this.meta, nodes: this.nodes, edges: this.edges };
  }

  private validateNodeIds(): void {
    const entries: NodeIdEntry[] = [];

    for (const node of this.nodes) {
      const tokenName = typeof node.type === "function" ? node.type.name : String(node.type);
      entries.push({ nodeId: node.id, tokenName, label: node.name ?? "" });

      if (AgentConfigInspector.isAgentNodeConfig(node.config)) {
        for (const child of AgentConnectionNodeCollector.collect(node.id, node.config)) {
          entries.push({ nodeId: child.nodeId, tokenName: child.typeName, label: child.name });
        }
      }
    }

    const emptyIds: NodeIdEntry[] = [];
    const seenIds = new Map<string, NodeIdEntry>();
    const duplicateIds: NodeIdEntry[] = [];

    for (const entry of entries) {
      if (!entry.nodeId) {
        emptyIds.push(entry);
        continue;
      }
      const existing = seenIds.get(entry.nodeId);
      if (existing) {
        if (!duplicateIds.includes(existing)) {
          duplicateIds.push(existing);
        }
        duplicateIds.push(entry);
      } else {
        seenIds.set(entry.nodeId, entry);
      }
    }

    if (emptyIds.length === 0 && duplicateIds.length === 0) {
      return;
    }

    const lines: string[] = ["WorkflowBuilder.build() found invalid node ids:"];

    if (emptyIds.length > 0) {
      lines.push("  Empty ids (label is blank and no explicit id was given):");
      for (const e of emptyIds) {
        lines.push(`    - type "${e.tokenName}" label "${e.label}"`);
      }
    }

    if (duplicateIds.length > 0) {
      lines.push("  Duplicate ids:");
      for (const e of duplicateIds) {
        lines.push(`    - id "${e.nodeId}" type "${e.tokenName}" label "${e.label}"`);
      }
    }

    lines.push("  Fix: set an explicit `id:` on each offending node config.");

    throw new WorkflowDefinitionError(lines.join("\n"));
  }
}

export { ChainCursor } from "./ChainCursorResolver";
export { WhenBuilder } from "./WhenBuilder";
