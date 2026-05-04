import type {
  Items,
  NodeExecutionContext,
  NodeOutputs,
  TestableTriggerNode,
  TriggerSetupContext,
  TriggerTestItemsContext,
} from "@codemation/core";

import { node } from "@codemation/core";

import { CronTrigger } from "./CronTriggerFactory";

@node({ packageName: "@codemation/core-nodes" })
export class CronTriggerNode implements TestableTriggerNode<CronTrigger> {
  readonly kind = "trigger" as const;
  readonly outputPorts = ["main"] as const;

  async setup(ctx: TriggerSetupContext<CronTrigger>): Promise<undefined> {
    const job = ctx.config.createJob(async (self) => {
      const scheduledFor = self.currentRun()?.toISOString() ?? ctx.now().toISOString();
      await ctx.emit([{ json: { firedAt: ctx.now().toISOString(), scheduledFor } }]);
    });
    ctx.registerCleanup({
      stop: () => {
        job.stop();
      },
    });
    return undefined;
  }

  async execute(items: Items, _ctx: NodeExecutionContext<CronTrigger>): Promise<NodeOutputs> {
    return { main: items };
  }

  async getTestItems(ctx: TriggerTestItemsContext<CronTrigger>): Promise<Items> {
    const nowIso = ctx.now().toISOString();
    return [{ json: { firedAt: nowIso, scheduledFor: nowIso } }];
  }
}
