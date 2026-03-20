import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Prisma's generated `runtime/*.js` files end with `//# sourceMappingURL=*.map`, but Prisma does not
 * ship those `.map` files (see prisma/prisma#28373). Vite then logs ENOENT on every transform.
 * We write minimal valid sourcemaps so the URL resolves and stack tooling stays stable.
 */
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtimeDir = path.resolve(packageRoot, "src/infrastructure/persistence/generated/prisma-client/runtime");

function writeStub(mapFileName, jsFileName) {
  const mapPath = path.join(runtimeDir, mapFileName);
  const jsPath = path.join(runtimeDir, jsFileName);
  if (!fs.existsSync(jsPath)) {
    return;
  }
  const payload = JSON.stringify({
    version: 3,
    file: jsFileName,
    sources: [],
    names: [],
    mappings: "",
  });
  fs.writeFileSync(mapPath, `${payload}\n`, "utf8");
}

export default function ensurePrismaRuntimeSourcemaps() {
  if (!fs.existsSync(runtimeDir)) {
    return;
  }
  writeStub("client.js.map", "client.js");
  writeStub("index-browser.js.map", "index-browser.js");
  writeStub("wasm-compiler-edge.js.map", "wasm-compiler-edge.js");
}

const selfPath = path.resolve(fileURLToPath(import.meta.url));
const invokedDirectly = path.resolve(process.argv[1] ?? "") === selfPath;
if (invokedDirectly) {
  ensurePrismaRuntimeSourcemaps();
}
