import type { PersistedTriggerSetupState, TriggerInstanceId, TriggerSetupStateStore } from "@codemation/core";
import { inject, injectable } from "@codemation/core";
import { PrismaClient } from "./generated/prisma-client/client.js";

type TriggerSetupStateJson = Readonly<{
  state: PersistedTriggerSetupState["state"];
}>;

@injectable()
export class PrismaTriggerSetupStateStore implements TriggerSetupStateStore {
  constructor(@inject(PrismaClient) private readonly prisma: PrismaClient) {}

  async load(trigger: TriggerInstanceId): Promise<PersistedTriggerSetupState | undefined> {
    const row = await this.prisma.triggerSetupState.findUnique({
      where: {
        workflowId_nodeId: {
          workflowId: trigger.workflowId,
          nodeId: trigger.nodeId,
        },
      },
    });
    if (!row) {
      return undefined;
    }
    return {
      trigger: {
        workflowId: row.workflowId,
        nodeId: row.nodeId,
      },
      updatedAt: row.updatedAt,
      state: (JSON.parse(row.stateJson) as TriggerSetupStateJson).state,
    };
  }

  async save(state: PersistedTriggerSetupState): Promise<void> {
    await this.prisma.triggerSetupState.upsert({
      where: {
        workflowId_nodeId: {
          workflowId: state.trigger.workflowId,
          nodeId: state.trigger.nodeId,
        },
      },
      create: {
        workflowId: state.trigger.workflowId,
        nodeId: state.trigger.nodeId,
        updatedAt: state.updatedAt,
        stateJson: JSON.stringify({
          state: state.state,
        } satisfies TriggerSetupStateJson),
      },
      update: {
        updatedAt: state.updatedAt,
        stateJson: JSON.stringify({
          state: state.state,
        } satisfies TriggerSetupStateJson),
      },
    });
  }

  async delete(trigger: TriggerInstanceId): Promise<void> {
    await this.prisma.triggerSetupState.deleteMany({
      where: {
        workflowId: trigger.workflowId,
        nodeId: trigger.nodeId,
      },
    });
  }
}
