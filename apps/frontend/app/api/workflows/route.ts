export const runtime = "nodejs";

import { codemationHost } from "../_codemation/codemationHost";

export async function GET(): Promise<Response> {
  const ctx = await codemationHost.get();
  await ctx.ensureStarted();

  const workflows = [...ctx.workflowsById.values()].map((w) => ({ id: w.id, name: w.name }));
  return Response.json(workflows);
}

