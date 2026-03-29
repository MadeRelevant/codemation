import type { TypeToken } from "../di";
import type { NodeId, NodeResolver, WorkflowDefinition, WorkflowNodeInstanceFactory } from "../types";

import { MissingRuntimeNode, MissingRuntimeTrigger } from "../workflowSnapshots";
import { MissingRuntimeNodeToken } from "../workflowSnapshots/MissingRuntimeNodeToken";
import { MissingRuntimeTriggerToken } from "../workflowSnapshots/MissingRuntimeTriggerToken";

export class NodeInstanceFactory implements WorkflowNodeInstanceFactory {
  constructor(private readonly nodeResolver: NodeResolver) {}

  createNodes(workflow: WorkflowDefinition): Map<NodeId, unknown> {
    const nodeInstances = new Map<NodeId, unknown>();
    for (const definition of workflow.nodes) {
      nodeInstances.set(definition.id, this.createNode(definition));
    }
    return nodeInstances;
  }

  createNode(definition: WorkflowDefinition["nodes"][number]): unknown {
    return this.createByType(definition.type);
  }

  createByType(type: TypeToken<unknown>): unknown {
    if (type === MissingRuntimeNodeToken) {
      return new MissingRuntimeNode();
    }
    if (type === MissingRuntimeTriggerToken) {
      return new MissingRuntimeTrigger();
    }
    return this.nodeResolver.resolve(type);
  }
}
