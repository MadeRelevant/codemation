/**
 * Serves raw lucide SVG glyphs from `lucide-static` to support consumer-supplied
 * `icon: "lucide:<name>"` tokens without re-introducing the May 2026 client-bundle OOM.
 *
 * The bundler trap: any client-side `import()` with a template prefix (e.g.
 * ``import(`lucide-react/dist/esm/icons/${name}.js`)``) makes Webpack/Turbopack
 * fan out into a context chunk over the whole prefix and bundle all 1,713 icon
 * files (~1.8 MB / 17% of the workflow detail page bundle, peak 5 GB RSS during
 * Turbopack dev compile). See commit ddaa265f for the prior fix.
 *
 * This route side-steps that entirely: lucide-static is read from disk in a
 * route handler (server-only bundle, never reaches the client). The client never
 * imports any lucide module; it just paints the URL into a CSS `mask-image`.
 *
 * Name validation defends against path traversal and restricts to lucide's kebab
 * convention. The response is cached forever (`immutable`) — lucide icon glyphs
 * are versioned by the lucide-static package version, which moves only on
 * dependency upgrades.
 */
import { lucideIconGet } from "../lucideIconGet";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: Readonly<{ params: Promise<Readonly<{ name: string }>> }>,
): Promise<Response> {
  const { name: rawName } = await context.params;
  return lucideIconGet(rawName);
}
