export const runtime = "nodejs";

import { codemationNextRuntimeRegistry } from "../../../../src/runtime/codemationNextRuntimeRegistry";
import { CodemationWorkflowDtoMapper } from "../../../../src/host/codemationWorkflowDtoMapper";

export async function GET(_: Request, context: { params: Promise<{ workflowId: string }> }): Promise<Response> {
  const { workflowId } = await context.params;
  const setup = await codemationNextRuntimeRegistry.getSetup();
  const workflow = setup.application.getWorkflows().find((entry) => entry.id === decodeURIComponent(workflowId));
  if (!workflow) {
    return Response.json({ error: "Unknown workflowId" }, { status: 404 });
  }
  const workflowDtoMapper = setup.application.getContainer().resolve(CodemationWorkflowDtoMapper);
  return Response.json(workflowDtoMapper.toDetail(workflow));
}

