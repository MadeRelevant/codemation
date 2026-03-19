import { CodemationNextHost } from "../../../../src/server/CodemationNextHost";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return await (await CodemationNextHost.shared.getCredentialHandler()).getCredentialTypes();
}
