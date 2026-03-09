export const runtime = "nodejs";

import { codemationHost } from "../../_codemation/codemationHost";

export async function POST(req: Request, context: { params: Promise<{ endpointId: string }> }): Promise<Response> {
  const { endpointId } = await context.params;

  const ctx = await codemationHost.get();
  await ctx.ensureStarted();

  const entry = ctx.webhookRegistry.get(endpointId);
  if (!entry) return Response.json({ error: "Unknown webhook endpoint" }, { status: 404 });

  if (String(entry.method).toUpperCase() !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });

  const body = await req.json().catch(() => ({}));
  const items = await entry.handler(body);

  return Response.json({ ok: true, items });
}

