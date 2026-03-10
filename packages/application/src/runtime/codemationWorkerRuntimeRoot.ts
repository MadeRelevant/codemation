import type { CredentialService, NodeResolver, RunStateStore, WorkflowRegistry, WorkflowRunnerService } from "@codemation/core";
import { Engine, injectable } from "@codemation/core";
import { BullmqScheduler } from "@codemation/queue-bullmq";
import type { RealtimeRuntimeDiagnostics } from "../realtimeRuntimeFactory";
import { CodemationStartupSummaryReporter } from "../startupSummary";

type StopHandle = Readonly<{ stop: () => Promise<void> }>;

@injectable()
export class CodemationWorkerRuntimeRoot {
  constructor(
    private readonly engine: Engine,
    private readonly scheduler: BullmqScheduler,
    private readonly startupSummaryReporter: CodemationStartupSummaryReporter,
    private readonly workflowRegistry: WorkflowRegistry,
    private readonly workflowRunner: WorkflowRunnerService,
    private readonly nodeResolver: NodeResolver,
    private readonly credentials: CredentialService,
    private readonly runStore: RunStateStore,
    private readonly runtimeDiagnostics: RealtimeRuntimeDiagnostics,
  ) {}

  async start(args: Readonly<{ queues: ReadonlyArray<string>; bootstrapSource?: string | null; workflowSources?: ReadonlyArray<string> }>): Promise<StopHandle> {
    const workflows = this.workflowRegistry.list();
    await this.engine.start([...workflows]);
    const workflowsById = new Map(workflows.map((workflow) => [workflow.id, workflow] as const));
    const worker = this.scheduler.createWorker({
      queues: args.queues,
      workflowsById,
      nodeResolver: this.nodeResolver,
      credentials: this.credentials,
      runStore: this.runStore,
      continuation: this.engine,
      workflows: this.workflowRunner,
    });

    this.startupSummaryReporter.reportWorker({
      processLabel: "worker startup summary",
      runtime: this.runtimeDiagnostics,
      workflowDefinitions: workflows,
      queues: args.queues,
      bootstrapSource: args.bootstrapSource ?? null,
      workflowSources: args.workflowSources ?? [],
    });

    return {
      stop: async () => {
        await worker.stop();
        await this.scheduler.close();
      },
    };
  }
}
