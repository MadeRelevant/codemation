import { createRequire } from "node:module";
import path from "node:path";

export class CodemationViteBinaryResolver {
  resolve(applicationRoot: string): string {
    const packageRequire = createRequire(path.resolve(applicationRoot, "package.json"));
    const vitePackageJsonPath = packageRequire.resolve("vite/package.json");
    return path.resolve(path.dirname(vitePackageJsonPath), "bin", "vite.js");
  }
}
