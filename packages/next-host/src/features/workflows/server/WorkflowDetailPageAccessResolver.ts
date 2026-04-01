import type { WorkflowDetailPageApiPort } from "./WorkflowDetailPageApiPort.types";

export class WorkflowDetailPageAccessResolver {
  constructor(private readonly api: WorkflowDetailPageApiPort) {}

  async resolve(args: Readonly<{ workflowId: string; cookieHeader: string | null }>): Promise<"render" | "not-found"> {
    const status = await this.api.fetchWorkflowStatus(args);
    return status === 404 ? "not-found" : "render";
  }
}
