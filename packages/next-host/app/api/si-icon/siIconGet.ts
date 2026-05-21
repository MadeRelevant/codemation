/**
 * Shared implementation for the Simple Icons GET handler.
 * Used by both the specific [slug] route and the catch-all guard.
 */
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const SI_SLUG_RE = /^[a-z0-9-]+$/;

export async function siIconGet(rawSlug: string): Promise<Response> {
  const slug = (rawSlug ?? "").replace(/\.svg$/i, "");
  if (!SI_SLUG_RE.test(slug)) {
    return new Response("Invalid icon slug", { status: 400 });
  }
  // simple-icons exports `./icons/*` directly. Resolving the literal sub-path gives the
  // absolute file path; readFile from there. Unknown slugs raise ERR_PACKAGE_PATH_NOT_EXPORTED.
  const req = createRequire(fileURLToPath(import.meta.url));
  let filePath: string;
  try {
    filePath = req.resolve(`simple-icons/icons/${slug}.svg`);
  } catch {
    return new Response("Icon not found", { status: 404 });
  }
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
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
