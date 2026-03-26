import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Locates the installed `@codemation/host` package root (contains `prisma/` and Prisma CLI).
 * Uses ESM resolution (`@codemation/host` does not expose a CJS `require` entry).
 */
export class HostPackageRootResolver {
  resolveHostPackageRoot(): string {
    const entryUrl = import.meta.resolve("@codemation/host");
    const entry = fileURLToPath(entryUrl);
    let dir = path.dirname(entry);
    for (let depth = 0; depth < 8; depth += 1) {
      if (existsSync(path.join(dir, "prisma", "schema.prisma"))) {
        return dir;
      }
      const parent = path.dirname(dir);
      if (parent === dir) {
        break;
      }
      dir = parent;
    }
    throw new Error(`Could not locate prisma/schema.prisma near @codemation/host entry: ${entry}`);
  }
}
