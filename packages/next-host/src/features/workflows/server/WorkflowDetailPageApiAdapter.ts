import { ApiPaths } from "@codemation/host-src/presentation/http/ApiPaths";

import { CodemationNextHost } from "../../../server/CodemationNextHost";

import type { WorkflowDetailPageApiPort } from "./WorkflowDetailPageApiPort.types";

export class WorkflowDetailPageApiAdapter implements WorkflowDetailPageApiPort {
  async fetchWorkflowStatus(args: Readonly<{ workflowId: string; cookieHeader: string | null }>): Promise<number> {
    const requestHeaders = new Headers();
    if (args.cookieHeader && args.cookieHeader.trim().length > 0) {
      requestHeaders.set("cookie", args.cookieHeader);
    }
    const response = await CodemationNextHost.shared.fetchApi(
      new Request(`http://codemation.local${ApiPaths.workflow(args.workflowId)}`, {
        method: "GET",
        headers: requestHeaders,
      }),
    );
    return response.status;
  }
}
