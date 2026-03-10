export const runtime = "nodejs";

import { codemationProxyClient } from "../_codemation/codemationProxy";

export async function POST(req: Request): Promise<Response> {
  return await codemationProxyClient.forward(req, "/api/run");
}

