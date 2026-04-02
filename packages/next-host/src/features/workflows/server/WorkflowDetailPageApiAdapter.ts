import { ApiPaths } from "@codemation/host-src/presentation/http/ApiPaths";

import { CodemationRuntimeUrlResolver } from "../../../bootstrap/CodemationRuntimeUrlResolver";

import type { WorkflowDetailPageApiPort } from "./WorkflowDetailPageApiPort.types";

export class WorkflowDetailPageApiAdapter implements WorkflowDetailPageApiPort {
  private readonly runtimeUrlResolver = new CodemationRuntimeUrlResolver();

  async fetchWorkflowStatus(args: Readonly<{ workflowId: string; cookieHeader: string | null }>): Promise<number> {
    const requestHeaders = new Headers();
    if (args.cookieHeader && args.cookieHeader.trim().length > 0) {
      requestHeaders.set("cookie", args.cookieHeader);
    }
    const response = await fetch(this.runtimeUrlResolver.resolve(ApiPaths.workflow(args.workflowId)), {
      method: "GET",
      headers: requestHeaders,
      cache: "no-store",
    });
    return response.status;
  }
}
