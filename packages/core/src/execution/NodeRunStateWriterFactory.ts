import type {
  NodeExecutionStatePublisher,
  ParentExecutionRef,
  RunId,
  WorkflowExecutionRepository,
  WorkflowId,
} from "../types";

import { NodeEventPublisher } from "../events/NodeEventPublisher";
import { NodeRunStateWriter } from "./NodeRunStateWriter";

export class NodeRunStateWriterFactory {
  constructor(
    private readonly workflowExecutionRepository: WorkflowExecutionRepository,
    private readonly nodeEventPublisher: NodeEventPublisher,
  ) {}

  create(runId: RunId, workflowId: WorkflowId, parent: ParentExecutionRef | undefined): NodeExecutionStatePublisher {
    return new NodeRunStateWriter(
      this.workflowExecutionRepository,
      runId,
      workflowId,
      parent,
      async (kind, snapshot) => {
        await this.nodeEventPublisher.publish(kind, snapshot);
      },
    );
  }
}
