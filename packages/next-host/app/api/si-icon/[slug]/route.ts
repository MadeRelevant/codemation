/**
 * Serves raw Simple Icons SVG glyphs from `simple-icons/icons/<slug>.svg` on disk.
 *
 * The bundling trap: `simple-icons` ships a single ~5.2 MB CommonJS barrel (`index.js`)
 * containing all 3000+ brand SVG paths. Named imports from that barrel pull the whole
 * file into the client bundle — the same class of regression previously fixed for
 * `lucide-react` (commit ddaa265f / 54c3a392).
 *
 * This route side-steps that entirely: the SVG file is read from disk in a server-side
 * route handler (never reaches the client). The client renders via CSS `mask-image`.
 *
 * Slug validation defends against path traversal. The response is cached forever
 * (`immutable`) — icon glyphs are versioned by the simple-icons package version.
 */
import { siIconGet } from "../siIconGet";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: Readonly<{ params: Promise<Readonly<{ slug: string }>> }>,
): Promise<Response> {
  const { slug: rawSlug } = await context.params;
  return siIconGet(rawSlug);
}
