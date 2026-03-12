import type { CodemationBootstrapResult } from "../bootstrapDiscovery";
import { CodemationRouteHandlers } from "../routeExports";
import type { WorkflowDto, WorkflowSummary } from "../realtime/realtime";

class ResponseReader {
  static async readJson<TResponse>(response: Response): Promise<TResponse> {
    if (!response.ok) {
      throw new Error(await response.text());
    }
    return (await response.json()) as TResponse;
  }
}

export class WorkflowLoader {
  static async loadSummaries(configOverride: CodemationBootstrapResult): Promise<ReadonlyArray<WorkflowSummary>> {
    return await ResponseReader.readJson<ReadonlyArray<WorkflowSummary>>(await CodemationRouteHandlers.getWorkflows({ configOverride }));
  }

  static async loadDetail(configOverride: CodemationBootstrapResult, workflowId: string): Promise<WorkflowDto> {
    return await ResponseReader.readJson<WorkflowDto>(
      await CodemationRouteHandlers.getWorkflow(
        new Request("http://codemation.local/workflow-detail"),
        { params: Promise.resolve({ workflowId }) },
        { configOverride },
      ),
    );
  }
}
