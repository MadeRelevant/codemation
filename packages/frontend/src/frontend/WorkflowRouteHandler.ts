import type { RunListingStore, WorkflowDefinition } from "@codemation/core";
import { injectable } from "@codemation/core";
import type { CodemationBootstrapResult } from "../bootstrapDiscovery";
import { CodemationApplication } from "../codemationApplication";
import { CodemationWorkflowDtoMapper } from "../host/codemationWorkflowDtoMapper";
import type { PreparedExecutionRuntimeProvider } from "./frontendRouteTokens";

@injectable()
export class WorkflowRouteHandler {
  constructor(
    private readonly application: CodemationApplication,
    private readonly workflowDtoMapper: CodemationWorkflowDtoMapper,
    private readonly runtimeProvider: PreparedExecutionRuntimeProvider,
  ) {}

  async getWorkflows(): Promise<Response> {
    return Response.json(this.application.getWorkflows().map((workflow) => this.workflowDtoMapper.toSummary(workflow)));
  }

  async getWorkflow(workflowId: string): Promise<Response> {
    const workflow = this.findWorkflow(workflowId);
    if (!workflow) {
      return Response.json({ error: "Unknown workflowId" }, { status: 404 });
    }
    return Response.json(this.workflowDtoMapper.toDetail(workflow));
  }

  async getWorkflowRuns(
    workflowId: string,
    args?: Readonly<{ configOverride?: CodemationBootstrapResult }>,
  ): Promise<Response> {
    const runtime = await this.runtimeProvider.getPreparedExecutionRuntime(args);
    const listingStore = runtime.runStore as unknown as Partial<RunListingStore>;
    const runs = listingStore.listRuns ? await listingStore.listRuns({ workflowId: decodeURIComponent(workflowId), limit: 50 }) : [];
    return Response.json(runs);
  }

  private findWorkflow(workflowId: string): WorkflowDefinition | undefined {
    const decodedWorkflowId = decodeURIComponent(workflowId);
    return this.application.getWorkflows().find((entry) => entry.id === decodedWorkflowId);
  }
}
