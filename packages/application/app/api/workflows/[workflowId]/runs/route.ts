export const runtime = "nodejs";

import { codemationProxyClient } from "../../../_codemation/codemationProxy";

export async function GET(request: Request, context: { params: Promise<{ workflowId: string }> }): Promise<Response> {
  const { workflowId } = await context.params;
  return await codemationProxyClient.forward(request, `/api/workflows/${encodeURIComponent(workflowId)}/runs`);
}

