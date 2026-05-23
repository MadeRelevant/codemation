import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

/**
 * The package's `dist/` must exist before this test runs. Turbo's per-package
 * `turbo.json` makes `test:unit` depend on `build`, so the dist is materialised
 * when this test executes under the turbo task graph. Running the file directly
 * with `vitest run` requires a manual `pnpm build` first.
 */
class PackageEntrypointSmokeFixture {
  static readonly packageRoot = new URL("../", import.meta.url);

  static resolvePath(relativePath: string): string {
    return fileURLToPath(new URL(relativePath, this.packageRoot));
  }
}

test("build emits the declared root entrypoints", () => {
  assert.equal(existsSync(PackageEntrypointSmokeFixture.resolvePath("dist/index.js")), true);
  assert.equal(existsSync(PackageEntrypointSmokeFixture.resolvePath("dist/index.cjs")), true);
  assert.equal(existsSync(PackageEntrypointSmokeFixture.resolvePath("dist/index.d.ts")), true);
  assert.equal(existsSync(PackageEntrypointSmokeFixture.resolvePath("dist/codemation.plugin.js")), true);
});

test("Node ESM can import the package root by name after build", () => {
  const output = execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      "import('@codemation/core-nodes-gmail').then((module) => { console.log(String('OnNewGmailTrigger' in module)); });",
    ],
    {
      cwd: PackageEntrypointSmokeFixture.resolvePath("./"),
      encoding: "utf8",
    },
  ).trim();
  assert.equal(output, "true");
});

test("consumer-style typecheck resolves the package root exports", () => {
  // Cross-platform tsc invocation: spawn Node against typescript's JS entrypoint rather than the
  // .cmd/.ps1 shim — Node's spawn refuses .cmd post-CVE-2024-27980 without `shell: true`.
  const requireFromHere = createRequire(import.meta.url);
  const tscPath = requireFromHere.resolve("typescript/bin/tsc");
  execFileSync(process.execPath, [tscPath, "-p", "test/fixtures/consumer-tsconfig.json", "--noEmit"], {
    cwd: PackageEntrypointSmokeFixture.resolvePath("./"),
    stdio: "pipe",
  });
});
