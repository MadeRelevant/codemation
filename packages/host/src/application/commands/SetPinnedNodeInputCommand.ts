import type { PersistedRunState } from "@codemation/core";
import { Command } from "../bus/Command";
import type { UpdateRunNodePinRequest } from "../contracts/RunContracts";

export class SetPinnedNodeInputCommand extends Command<PersistedRunState> {
  constructor(
    public readonly runId: string,
    public readonly nodeId: string,
    public readonly body: UpdateRunNodePinRequest,
  ) {
    super();
  }
}
