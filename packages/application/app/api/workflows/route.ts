export const runtime = "nodejs";

import { codemationProxyClient } from "../_codemation/codemationProxy";

export async function GET(request: Request): Promise<Response> {
  return await codemationProxyClient.forward(request, "/api/workflows");
}

