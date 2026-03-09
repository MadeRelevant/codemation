export const runtime = "nodejs";

import type { NodeDefinition, WorkflowDefinition } from "@codemation/core";
import { codemationHost } from "../../_codemation/codemationHost";

type WorkflowDto = Readonly<{
  id: string;
  name: string;
  nodes: ReadonlyArray<Readonly<{ id: string; kind: string; name?: string; type: string }>>;
  edges: WorkflowDefinition["edges"];
}>;

function nodeTypeName(node: NodeDefinition): string {
  const tokenAny = node.config?.token as unknown as { name?: unknown } | undefined;
  if (typeof tokenAny?.name === "string" && tokenAny.name) return tokenAny.name;

  const nodeTokenAny = node.token as unknown as { name?: unknown } | undefined;
  if (typeof nodeTokenAny?.name === "string" && nodeTokenAny.name) return nodeTokenAny.name;

  return "Node";
}

export async function GET(_req: Request, context: { params: Promise<{ workflowId: string }> }): Promise<Response> {
  const { workflowId } = await context.params;

  const ctx = await codemationHost.get();
  await ctx.ensureStarted();

  const wf = ctx.workflowsById.get(workflowId);
  if (!wf) return Response.json({ error: "Unknown workflowId" }, { status: 404 });

  const dto: WorkflowDto = {
    id: wf.id,
    name: wf.name,
    nodes: wf.nodes.map((n) => ({
      id: n.id,
      kind: n.kind,
      name: n.name ?? n.config?.name,
      type: nodeTypeName(n),
    })),
    edges: wf.edges,
  };

  return Response.json(dto);
}

