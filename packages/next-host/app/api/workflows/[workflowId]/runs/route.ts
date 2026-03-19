import { CodemationNextHost } from "../../../../../src/server/CodemationNextHost";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  args: Readonly<{ params: Promise<{ workflowId: string }> }>,
): Promise<Response> {
  const params = await args.params;
  return await (await CodemationNextHost.shared.getWorkflowHandler()).getWorkflowRuns(request, {
    workflowId: params.workflowId,
  });
}
