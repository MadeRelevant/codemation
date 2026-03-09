export const runtime = "nodejs";

import { codemationHost } from "../../_codemation/codemationHost";

export async function GET(_req: Request, context: { params: Promise<{ runId: string }> }): Promise<Response> {
  const { runId } = await context.params;

  const ctx = await codemationHost.get();
  await ctx.ensureStarted();

  const state = await ctx.runStore.load(runId);
  if (!state) return Response.json({ error: "Unknown runId" }, { status: 404 });

  return Response.json(state);
}
