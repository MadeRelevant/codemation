import { CodemationNextHost } from "../../../../../../../src/server/CodemationNextHost";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  args: Readonly<{ params: Promise<{ runId: string; binaryId: string }> }>,
): Promise<Response> {
  const params = await args.params;
  return await (await CodemationNextHost.shared.getBinaryHandler()).getRunBinaryContent(request, {
    runId: params.runId,
    binaryId: params.binaryId,
  });
}
