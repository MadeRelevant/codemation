export const runtime = "nodejs";

import { codemationNextRuntimeRegistry } from "../../../src/runtime/codemationNextRuntimeRegistry";
import { CodemationWorkflowDtoMapper } from "../../../src/host/codemationWorkflowDtoMapper";

export async function GET(): Promise<Response> {
  const setup = await codemationNextRuntimeRegistry.getSetup();
  const workflowDtoMapper = setup.application.getContainer().resolve(CodemationWorkflowDtoMapper);
  return Response.json(setup.application.getWorkflows().map((workflow) => workflowDtoMapper.toSummary(workflow)));
}

