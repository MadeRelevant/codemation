import type { PersistedRunState } from "@codemation/core";
import { Command } from "../bus/Command";
import type { UpdateRunWorkflowSnapshotRequest } from "../contracts/RunContracts";

export class ReplaceMutableRunWorkflowSnapshotCommand extends Command<PersistedRunState> {
  constructor(
    public readonly runId: string,
    public readonly body: UpdateRunWorkflowSnapshotRequest,
  ) {
    super();
  }
}
