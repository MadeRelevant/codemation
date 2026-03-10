export const runtime = "nodejs";

import { codemationProxyClient } from "../../_codemation/codemationProxy";

export async function GET(request: Request, context: { params: Promise<{ runId: string }> }): Promise<Response> {
  const { runId } = await context.params;
  return await codemationProxyClient.forward(request, `/api/runs/${encodeURIComponent(runId)}`);
}
