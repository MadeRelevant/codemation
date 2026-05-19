import { inject, injectable } from "@codemation/core";
import {
  PrismaDatabaseClientToken,
  type PrismaDatabaseClient,
} from "../infrastructure/persistence/PrismaDatabaseClient";
import type { IWorkflowAuditEmitter, WorkflowAuditEntry } from "./IAuditEmitter";

@injectable()
export class PrismaWorkflowAuditLogRepository implements IWorkflowAuditEmitter {
  constructor(
    @inject(PrismaDatabaseClientToken)
    private readonly prisma: PrismaDatabaseClient,
  ) {}

  async emit(entry: WorkflowAuditEntry): Promise<void> {
    await this.prisma.workflowAuditLog.create({
      data: {
        id: entry.id,
        occurredAt: new Date(entry.occurredAt),
        actorUserId: entry.actor.userId,
        actorSessionId: entry.actor.sessionId ?? null,
        action: entry.action,
        resourceType: entry.resource.type,
        resourceId: entry.resource.id,
        outcome: entry.outcome,
        errorCode: entry.errorCode ?? null,
        correlationId: entry.correlationId ?? null,
        workflowId: entry.workflowId,
        runId: entry.runId ?? null,
        nodeId: entry.nodeId ?? null,
      },
    });
  }
}
