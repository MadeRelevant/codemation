import { CodemationNextHost } from "../../../src/server/CodemationNextHost";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function handle(request: Request): Promise<Response> {
  return CodemationNextHost.shared.fetchApi(request);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
