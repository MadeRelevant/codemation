import { CodemationNextHost } from "../../../../src/server/CodemationNextHost";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return await (await CodemationNextHost.shared.getOAuth2Handler()).getCallback(request);
}
