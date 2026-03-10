export const runtime = "nodejs";

import type { RunListingStore } from "@codemation/core";
import { codemationNextRuntimeRegistry } from "../../../../../src/runtime/codemationNextRuntimeRegistry";

export async function GET(_: Request, context: { params: Promise<{ workflowId: string }> }): Promise<Response> {
  const { workflowId } = await context.params;
  const runtimeRoot = await codemationNextRuntimeRegistry.getRuntime();
  const listingStore = runtimeRoot.getRunStore() as unknown as Partial<RunListingStore>;
  const runs = listingStore.listRuns ? await listingStore.listRuns({ workflowId: decodeURIComponent(workflowId), limit: 50 }) : [];
  return Response.json(runs);
}

