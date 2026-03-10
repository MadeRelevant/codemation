import { createRequire } from "node:module";
import path from "node:path";

export class CodemationNextBinaryResolver {
  resolve(applicationRoot: string): string {
    const packageRequire = createRequire(path.resolve(applicationRoot, "package.json"));
    return packageRequire.resolve("next/dist/bin/next");
  }
}
