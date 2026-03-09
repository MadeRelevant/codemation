export const runtime = "nodejs";

import type { RunListingStore, RunSummary } from "@codemation/core";
import { codemationHost } from "../../../_codemation/codemationHost";

export async function GET(_req: Request, context: { params: Promise<{ workflowId: string }> }): Promise<Response> {
  const { workflowId } = await context.params;

  const ctx = await codemationHost.get();
  await ctx.ensureStarted();

  const storeAny = ctx.runStore as unknown as Partial<RunListingStore>;
  const runs: ReadonlyArray<RunSummary> = storeAny.listRuns ? await storeAny.listRuns({ workflowId, limit: 50 }) : [];

  return Response.json(runs);
}

