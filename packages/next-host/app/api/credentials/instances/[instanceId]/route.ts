import { CodemationNextHost } from "../../../../../src/server/CodemationNextHost";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  args: Readonly<{ params: Promise<{ instanceId: string }> }>,
): Promise<Response> {
  const params = await args.params;
  return await (await CodemationNextHost.shared.getCredentialHandler()).getCredentialInstance(request, {
    instanceId: params.instanceId,
  });
}

export async function PUT(
  request: Request,
  args: Readonly<{ params: Promise<{ instanceId: string }> }>,
): Promise<Response> {
  const params = await args.params;
  return await (await CodemationNextHost.shared.getCredentialHandler()).putCredentialInstance(request, {
    instanceId: params.instanceId,
  });
}

export async function DELETE(
  request: Request,
  args: Readonly<{ params: Promise<{ instanceId: string }> }>,
): Promise<Response> {
  const params = await args.params;
  return await (await CodemationNextHost.shared.getCredentialHandler()).deleteCredentialInstance(request, {
    instanceId: params.instanceId,
  });
}
