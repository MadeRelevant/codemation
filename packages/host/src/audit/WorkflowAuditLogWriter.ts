import type { RunEvent, RunEventBus, RunEventSubscription } from "@codemation/core";
import { CoreTokens, inject, injectable } from "@codemation/core";
import { ApplicationTokens } from "../applicationTokens";
import type { Logger, LoggerFactory } from "../application/logging/Logger";
import type { IWorkflowAuditEmitter } from "./IAuditEmitter";

/**
 * RunEventBus subscriber that persists workspace run-events as WorkflowAuditLog rows.
 * Best-effort: errors are logged and swallowed so workflow execution is never blocked.
 * Actor is recorded as "system" in V1 — the run event bus carries no user context.
 */
@injectable()
export class WorkflowAuditLogWriter {
  private subscription: RunEventSubscription | null = null;
  private readonly logger: Logger;

  constructor(
    @inject(CoreTokens.RunEventBus)
    private readonly runEventBus: RunEventBus,
    @inject(ApplicationTokens.WorkflowAuditEmitter)
    private readonly auditEmitter: IWorkflowAuditEmitter,
    @inject(ApplicationTokens.LoggerFactory)
    loggerFactory: LoggerFactory,
  ) {
    this.logger = loggerFactory.create("codemation.audit.workflow");
  }

  async start(): Promise<void> {
    if (this.subscription) {
      return;
    }
    this.subscription = await this.runEventBus.subscribe(async (event) => {
      try {
        await this.handleEvent(event);
      } catch (err) {
        // Audit must remain best-effort so workflow execution does not fail on observer persistence races.
        this.logger.error(
          "WorkflowAuditLogWriter: failed to persist audit entry",
          err instanceof Error ? err : undefined,
        );
      }
    });
  }

  async stop(): Promise<void> {
    if (!this.subscription) {
      return;
    }
    await this.subscription.close();
    this.subscription = null;
  }

  private async handleEvent(event: RunEvent): Promise<void> {
    switch (event.kind) {
      case "nodeCompleted":
        await this.auditEmitter.emit({
          id: globalThis.crypto.randomUUID(),
          occurredAt: event.at,
          actor: { userId: "system" },
          action: "workflow.node.completed",
          resource: { type: "node", id: event.snapshot.nodeId },
          outcome: "success",
          workflowId: event.workflowId,
          runId: event.runId,
          nodeId: event.snapshot.nodeId,
        });
        return;
      case "nodeFailed":
        await this.auditEmitter.emit({
          id: globalThis.crypto.randomUUID(),
          occurredAt: event.at,
          actor: { userId: "system" },
          action: "workflow.node.failed",
          resource: { type: "node", id: event.snapshot.nodeId },
          outcome: "failure",
          errorCode: event.snapshot.error?.name,
          workflowId: event.workflowId,
          runId: event.runId,
          nodeId: event.snapshot.nodeId,
        });
        return;
      case "runSaved":
        if (event.state.status === "completed") {
          await this.auditEmitter.emit({
            id: globalThis.crypto.randomUUID(),
            occurredAt: event.at,
            actor: { userId: "system" },
            action: "workflow.run.completed",
            resource: { type: "run", id: event.runId },
            outcome: "success",
            workflowId: event.workflowId,
            runId: event.runId,
          });
        } else if (event.state.status === "failed") {
          await this.auditEmitter.emit({
            id: globalThis.crypto.randomUUID(),
            occurredAt: event.at,
            actor: { userId: "system" },
            action: "workflow.run.failed",
            resource: { type: "run", id: event.runId },
            outcome: "failure",
            workflowId: event.workflowId,
            runId: event.runId,
          });
        }
        return;
      case "connectionInvocationStarted":
        await this.auditEmitter.emit({
          id: globalThis.crypto.randomUUID(),
          occurredAt: event.at,
          actor: { userId: "system" },
          action: "workflow.credential.used",
          resource: { type: "credential", id: event.record.connectionNodeId },
          outcome: "success",
          workflowId: event.workflowId,
          runId: event.runId,
        });
        return;
      default:
        // runCreated, nodeQueued, nodeStarted, connectionInvocationCompleted/Failed, testSuite*, testCase*
        // are not audit-relevant at this fidelity level.
        return;
    }
  }
}
