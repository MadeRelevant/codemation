export const runtime = "nodejs";

import { codemationNextRuntimeRegistry } from "../../../../src/runtime/codemationNextRuntimeRegistry";

export async function GET(_: Request, context: { params: Promise<{ runId: string }> }): Promise<Response> {
  const { runId } = await context.params;
  const runtimeRoot = await codemationNextRuntimeRegistry.getRuntime();
  const state = await runtimeRoot.getRunStore().load(decodeURIComponent(runId));
  if (!state) {
    return Response.json({ error: "Unknown runId" }, { status: 404 });
  }
  return Response.json(state);
}
