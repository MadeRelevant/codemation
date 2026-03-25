import type { NodeExecutionStatePublisher, ParentExecutionRef, RunId, RunStateStore, WorkflowId } from "../../../types";

import { BoundNodeExecutionStatePublisher } from "./BoundNodeExecutionStatePublisher";
import { NodeEventPublisher } from "../events/NodeEventPublisher";

export class NodeExecutionStatePublisherFactory {
  constructor(
    private readonly runStore: RunStateStore,
    private readonly nodeEventPublisher: NodeEventPublisher,
  ) {}

  create(runId: RunId, workflowId: WorkflowId, parent: ParentExecutionRef | undefined): NodeExecutionStatePublisher {
    return new BoundNodeExecutionStatePublisher(this.runStore, runId, workflowId, parent, async (kind, snapshot) => {
      await this.nodeEventPublisher.publish(kind, snapshot);
    });
  }
}
