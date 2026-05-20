/**
 * Shared implementation for the lucide icon GET handler.
 * Used by both the specific [name] route and the catch-all guard.
 */
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const LUCIDE_NAME_RE = /^[a-z][a-z0-9-]*$/;

let iconsDirectoryPromise: Promise<string> | undefined;

async function resolveIconsDirectory(): Promise<string> {
  if (iconsDirectoryPromise) {
    return iconsDirectoryPromise;
  }
  iconsDirectoryPromise = (async () => {
    // Use createRequire so package resolution is anchored to this file's
    // location — compatible with Next.js ESM API routes and standalone builds
    // where the bare `require` global is unavailable.
    const req = createRequire(fileURLToPath(import.meta.url));
    const pkgJsonPath = req.resolve("lucide-static/package.json");
    return join(dirname(pkgJsonPath), "icons");
  })();
  return iconsDirectoryPromise;
}

export async function lucideIconGet(rawName: string): Promise<Response> {
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
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
