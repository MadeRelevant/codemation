import type { RunCurrentState } from "../../../types";

export class RunCurrentStateFactory {
  static empty(): RunCurrentState {
    return {
      outputsByNode: {},
      nodeSnapshotsByNodeId: {},
      connectionInvocations: [],
      mutableState: undefined,
    };
  }

  static clone(currentState: RunCurrentState | undefined): RunCurrentState {
    if (!currentState) {
      return this.empty();
    }
    return {
      outputsByNode: { ...currentState.outputsByNode },
      nodeSnapshotsByNodeId: { ...currentState.nodeSnapshotsByNodeId },
      connectionInvocations: currentState.connectionInvocations ? [...currentState.connectionInvocations] : undefined,
      mutableState: currentState.mutableState,
    };
  }
}
