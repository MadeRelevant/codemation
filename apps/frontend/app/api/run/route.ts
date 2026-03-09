export const runtime = "nodejs";

import type { Items } from "@codemation/core";
import { codemationHost } from "../_codemation/codemationHost";

export async function POST(req: Request): Promise<Response> {
  const ctx = await codemationHost.get();
  await ctx.ensureStarted();

  const body = (await req.json().catch(() => ({}))) as { workflowId?: string; items?: Items; startAt?: string };
  if (!body.workflowId) return Response.json({ error: "Missing workflowId" }, { status: 400 });

  const wf = ctx.workflowsById.get(body.workflowId);
  if (!wf) return Response.json({ error: "Unknown workflowId" }, { status: 404 });

  const startAt = body.startAt ?? wf.nodes.find((n) => n.kind === "trigger")?.id ?? wf.nodes[0]!.id;
  const items = body.items ?? [{ json: {} }];
  const result = await ctx.engine.runWorkflow(wf, startAt as any, items, undefined);
  return Response.json(result);
}

