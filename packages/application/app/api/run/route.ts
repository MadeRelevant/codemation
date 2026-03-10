export const runtime = "nodejs";

import type { Items, NodeId, ParentExecutionRef } from "@codemation/core";
import { codemationNextRuntimeRegistry } from "../../../src/runtime/codemationNextRuntimeRegistry";

type RunRequestBody = Readonly<{
  workflowId?: string;
  items?: Items;
  startAt?: string;
}>;

export async function POST(req: Request): Promise<Response> {
  const body = (await req.json()) as RunRequestBody;
  if (!body.workflowId) {
    return Response.json({ error: "Missing workflowId" }, { status: 400 });
  }

  const runtimeRoot = await codemationNextRuntimeRegistry.getRuntime();
  const workflow = runtimeRoot.getWorkflow(body.workflowId);
  if (!workflow) {
    return Response.json({ error: "Unknown workflowId" }, { status: 404 });
  }

  const startAt = body.startAt ?? workflow.nodes.find((node) => node.kind === "trigger")?.id ?? workflow.nodes[0]!.id;
  const items = body.items ?? [{ json: {} }];
  const result = await runtimeRoot.getWorkflowRunner().runById({
    workflowId: workflow.id,
    startAt: startAt as NodeId,
    items,
    parent: undefined as ParentExecutionRef | undefined,
  });
  return Response.json(result);
}

