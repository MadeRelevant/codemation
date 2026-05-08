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
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export const runtime = "nodejs";

const LUCIDE_NAME_RE = /^[a-z][a-z0-9-]*$/;

let iconsDirectoryPromise: Promise<string> | undefined;

async function resolveIconsDirectory(): Promise<string> {
  if (iconsDirectoryPromise) {
    return iconsDirectoryPromise;
  }
  iconsDirectoryPromise = (async () => {
    // Resolve the package by its package.json so we don't depend on the entry export shape.
    // This works under Next's server bundle: lucide-static is treated as a runtime dep,
    // not pulled into the client graph.
    const pkgJsonPath = require.resolve("lucide-static/package.json");
    return join(dirname(pkgJsonPath), "icons");
  })();
  return iconsDirectoryPromise;
}

export async function GET(
  _request: Request,
  context: Readonly<{ params: Promise<Readonly<{ name: string }>> }>,
): Promise<Response> {
  const { name: rawName } = await context.params;
  const name = (rawName ?? "").replace(/\.svg$/i, "");
  if (!LUCIDE_NAME_RE.test(name)) {
    return new Response("Invalid icon name", { status: 400 });
  }
  const iconsDirectory = await resolveIconsDirectory();
  const filePath = join(iconsDirectory, `${name}.svg`);
  let body: string;
  try {
    body = await readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return new Response("Icon not found", { status: 404 });
    }
    throw error;
  }
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      // Lucide glyphs are versioned by the lucide-static package version; safe to cache forever.
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
