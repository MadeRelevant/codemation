import type {
  NodeExecutionStatePublisher,
  ParentExecutionRef,
  RunId,
  WorkflowExecutionRepository,
  WorkflowId,
} from "../types";

import { ConnectionInvocationEventPublisher } from "../events/ConnectionInvocationEventPublisher";
import { NodeEventPublisher } from "../events/NodeEventPublisher";
import type { RunEventBus } from "../events/runEvents";
import { NodeRunStateWriter } from "./NodeRunStateWriter";

export class NodeRunStateWriterFactory {
  constructor(
    private readonly workflowExecutionRepository: WorkflowExecutionRepository,
    private readonly nodeEventPublisher: NodeEventPublisher,
    private readonly eventBus?: RunEventBus,
  ) {}

  create(runId: RunId, workflowId: WorkflowId, parent: ParentExecutionRef | undefined): NodeExecutionStatePublisher {
    const connectionInvocationEventPublisher = new ConnectionInvocationEventPublisher(this.eventBus, parent);
    return new NodeRunStateWriter(
      this.workflowExecutionRepository,
      runId,
      workflowId,
      parent,
      async (kind, snapshot) => {
        await this.nodeEventPublisher.publish(kind, snapshot);
      },
      async (record) => {
        await connectionInvocationEventPublisher.publish(record);
      },
    );
  }
}
