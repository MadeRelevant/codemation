import type { RunCurrentState } from "@codemation/core";
import { inject,injectable } from "@codemation/core";
import type { WorkflowDebuggerOverlayRepository } from "../../domain/workflows/WorkflowDebuggerOverlayRepository";
import type { WorkflowDebuggerOverlayState } from "../../domain/workflows/WorkflowDebuggerOverlayState";
import { PrismaClient } from "./generated/prisma-client/client.js";

type DebuggerOverlayStateJson = Readonly<{
  currentState: RunCurrentState;
}>;

@injectable()
export class PrismaWorkflowDebuggerOverlayRepository implements WorkflowDebuggerOverlayRepository {
  constructor(@inject(PrismaClient) private readonly prisma: PrismaClient) {}

  async load(workflowId: string): Promise<WorkflowDebuggerOverlayState | undefined> {
    const decodedWorkflowId = decodeURIComponent(workflowId);
    const row = await this.prisma.workflowDebuggerOverlay.findUnique({
      where: { workflowId: decodedWorkflowId },
    });
    if (!row) {
      return undefined;
    }
    return this.rowToState(row);
  }

  async save(state: WorkflowDebuggerOverlayState): Promise<void> {
    await this.prisma.workflowDebuggerOverlay.upsert({
      where: { workflowId: state.workflowId },
      create: {
        workflowId: state.workflowId,
        updatedAt: state.updatedAt,
        copiedFromRunId: state.copiedFromRunId ?? null,
        stateJson: JSON.stringify(this.toStateJson(state)),
      },
      update: {
        updatedAt: state.updatedAt,
        copiedFromRunId: state.copiedFromRunId ?? null,
        stateJson: JSON.stringify(this.toStateJson(state)),
      },
    });
  }

  private rowToState(row: Readonly<{
    workflowId: string;
    updatedAt: string;
    copiedFromRunId: string | null;
    stateJson: string;
  }>): WorkflowDebuggerOverlayState {
    const parsed = JSON.parse(row.stateJson) as DebuggerOverlayStateJson;
    return {
      workflowId: row.workflowId,
      updatedAt: row.updatedAt,
      copiedFromRunId: row.copiedFromRunId ?? undefined,
      currentState: parsed.currentState,
    };
  }

  private toStateJson(state: WorkflowDebuggerOverlayState): DebuggerOverlayStateJson {
    return {
      currentState: state.currentState,
    };
  }
}
