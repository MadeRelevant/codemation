import { CodemationNextHost } from "../../../../../../../src/server/CodemationNextHost";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  args: Readonly<{ params: Promise<{ runId: string; nodeId: string }> }>,
): Promise<Response> {
  const params = await args.params;
  return await (await CodemationNextHost.shared.getRunHandler()).postRunNode(request, {
    runId: params.runId,
    nodeId: params.nodeId,
  });
}
