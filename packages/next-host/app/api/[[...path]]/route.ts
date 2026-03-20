export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(request: Request): Promise<Response> {
  const { CodemationNextHost } = await import("../../../src/server/CodemationNextHost");
  return CodemationNextHost.shared.fetchApi(request);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
