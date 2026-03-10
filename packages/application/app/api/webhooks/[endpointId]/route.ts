export const runtime = "nodejs";

import { codemationNextRuntimeRegistry } from "../../../../src/runtime/codemationNextRuntimeRegistry";

export async function POST(req: Request, context: { params: Promise<{ endpointId: string }> }): Promise<Response> {
  const { endpointId } = await context.params;
  const runtimeRoot = await codemationNextRuntimeRegistry.getRuntime();
  const entry = runtimeRoot.getWebhookRegistry().get(decodeURIComponent(endpointId));
  if (!entry) {
    return Response.json({ error: "Unknown webhook endpoint" }, { status: 404 });
  }
  if (String(entry.method).toUpperCase() !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const items = await entry.handler(await req.json());
  return Response.json({ ok: true, items });
}

