export const runtime = "nodejs";

import { codemationProxyClient } from "../../_codemation/codemationProxy";

export async function POST(req: Request, context: { params: Promise<{ endpointId: string }> }): Promise<Response> {
  const { endpointId } = await context.params;
  return await codemationProxyClient.forward(req, `/api/webhooks/${encodeURIComponent(endpointId)}`);
}

