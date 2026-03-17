import type { BinaryAttachment, Items, PersistedRunState, RunCurrentState } from "@codemation/core";
import { inject, injectable } from "@codemation/core";
import { ApplicationTokens } from "../../applicationTokens";
import type { WorkflowRunRepository } from "../../domain/runs/WorkflowRunRepository";
import type { WorkflowDebuggerOverlayRepository } from "../../domain/workflows/WorkflowDebuggerOverlayRepository";

@injectable()
export class RunBinaryAttachmentLookupService {
  constructor(
    @inject(ApplicationTokens.WorkflowRunRepository)
    private readonly workflowRunRepository: WorkflowRunRepository,
    @inject(ApplicationTokens.WorkflowDebuggerOverlayRepository)
    private readonly workflowDebuggerOverlayRepository: WorkflowDebuggerOverlayRepository,
  ) {}

  async findForRun(runId: string, binaryId: string): Promise<BinaryAttachment | undefined> {
    const state = await this.workflowRunRepository.load(runId);
    if (!state) {
      return undefined;
    }
    return this.findInRunState(state, binaryId);
  }

  async findForWorkflowOverlay(workflowId: string, binaryId: string): Promise<BinaryAttachment | undefined> {
    const state = await this.workflowDebuggerOverlayRepository.load(workflowId);
    if (!state) {
      return undefined;
    }
    return this.findInCurrentState(state.currentState, binaryId);
  }

  private findInRunState(state: PersistedRunState, binaryId: string): BinaryAttachment | undefined {
    const inOutputs = this.findInOutputsByNode(state.outputsByNode, binaryId);
    if (inOutputs) {
      return inOutputs;
    }
    const inSnapshots = this.findInNodeSnapshots(state, binaryId);
    if (inSnapshots) {
      return inSnapshots;
    }
    return this.findInMutableState(state.mutableState, binaryId);
  }

  private findInCurrentState(state: RunCurrentState, binaryId: string): BinaryAttachment | undefined {
    const inOutputs = this.findInOutputsByNode(state.outputsByNode, binaryId);
    if (inOutputs) {
      return inOutputs;
    }
    const inSnapshots = this.findInCurrentStateSnapshots(state, binaryId);
    if (inSnapshots) {
      return inSnapshots;
    }
    return this.findInMutableState(state.mutableState, binaryId);
  }

  private findInOutputsByNode(
    outputsByNode: Readonly<Record<string, Readonly<Partial<Record<string, Items>>>>>,
    binaryId: string,
  ): BinaryAttachment | undefined {
    for (const outputs of Object.values(outputsByNode)) {
      for (const items of Object.values(outputs)) {
        const attachment = this.findInItems(items, binaryId);
        if (attachment) {
          return attachment;
        }
      }
    }
    return undefined;
  }

  private findInNodeSnapshots(state: PersistedRunState, binaryId: string): BinaryAttachment | undefined {
    for (const snapshot of Object.values(state.nodeSnapshotsByNodeId)) {
      const inInputs = this.findInPortItemMap(snapshot.inputsByPort, binaryId);
      if (inInputs) {
        return inInputs;
      }
      const inOutputs = this.findInPortItemMap(snapshot.outputs, binaryId);
      if (inOutputs) {
        return inOutputs;
      }
    }
    return undefined;
  }

  private findInCurrentStateSnapshots(state: RunCurrentState, binaryId: string): BinaryAttachment | undefined {
    for (const snapshot of Object.values(state.nodeSnapshotsByNodeId)) {
      const inInputs = this.findInPortItemMap(snapshot.inputsByPort, binaryId);
      if (inInputs) {
        return inInputs;
      }
      const inOutputs = this.findInPortItemMap(snapshot.outputs, binaryId);
      if (inOutputs) {
        return inOutputs;
      }
    }
    return undefined;
  }

  private findInMutableState(
    mutableState: PersistedRunState["mutableState"] | RunCurrentState["mutableState"] | undefined,
    binaryId: string,
  ): BinaryAttachment | undefined {
    for (const nodeState of Object.values(mutableState?.nodesById ?? {})) {
      const inPinned = this.findInPortItemMap(nodeState.pinnedOutputsByPort, binaryId);
      if (inPinned) {
        return inPinned;
      }
      const inDebugInput = this.findInItems(nodeState.lastDebugInput, binaryId);
      if (inDebugInput) {
        return inDebugInput;
      }
    }
    return undefined;
  }

  private findInPortItemMap(
    itemMap: Readonly<Partial<Record<string, Items>>> | undefined,
    binaryId: string,
  ): BinaryAttachment | undefined {
    for (const items of Object.values(itemMap ?? {})) {
      const attachment = this.findInItems(items, binaryId);
      if (attachment) {
        return attachment;
      }
    }
    return undefined;
  }

  private findInItems(items: Items | undefined, binaryId: string): BinaryAttachment | undefined {
    for (const item of items ?? []) {
      for (const attachment of Object.values(item.binary ?? {})) {
        if (attachment.id === binaryId) {
          return attachment;
        }
      }
    }
    return undefined;
  }
}
