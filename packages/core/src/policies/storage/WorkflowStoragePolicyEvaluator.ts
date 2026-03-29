import type { TypeToken } from "../../di";
import type {
  NodeResolver,
  PersistedRunPolicySnapshot,
  WorkflowDefinition,
  WorkflowStoragePolicyDecisionArgs,
  WorkflowStoragePolicyMode,
  WorkflowStoragePolicyResolver,
} from "../../types";

export class WorkflowStoragePolicyEvaluator {
  constructor(private readonly nodeResolver: NodeResolver) {}

  async shouldPersist(
    workflow: WorkflowDefinition,
    snapshot: PersistedRunPolicySnapshot | undefined,
    args: WorkflowStoragePolicyDecisionArgs,
  ): Promise<boolean> {
    const spec = workflow.storagePolicy;
    if (spec === undefined) {
      return this.modeMatches(snapshot?.storagePolicy ?? "ALL", args);
    }
    if (typeof spec === "string") {
      return this.modeMatches(spec as WorkflowStoragePolicyMode, args);
    }
    const resolver = this.nodeResolver.resolve(
      spec as TypeToken<WorkflowStoragePolicyResolver>,
    ) as WorkflowStoragePolicyResolver;
    return Boolean(await resolver.shouldPersist(args));
  }

  private modeMatches(mode: WorkflowStoragePolicyMode, args: WorkflowStoragePolicyDecisionArgs): boolean {
    if (mode === "ALL") return true;
    if (mode === "NEVER") return false;
    if (mode === "SUCCESS") return args.finalStatus === "completed";
    if (mode === "ERROR") return args.finalStatus === "failed";
    return true;
  }
}
