import { CodemationNextHost } from "../../../../../../src/server/CodemationNextHost";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  args: Readonly<{ params: Promise<{ workflowId: string }> }>,
): Promise<Response> {
  const params = await args.params;
  return await (await CodemationNextHost.shared.getWorkflowHandler()).postCopyWorkflowDebuggerOverlay(request, {
    workflowId: params.workflowId,
  });
}
