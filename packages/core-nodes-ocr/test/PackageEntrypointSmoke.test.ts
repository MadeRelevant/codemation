import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { test } from "vitest";

class PackageEntrypointSmokeFixture {
  static readonly packageRoot = new URL("../", import.meta.url);
  static readonly workspaceRoot = new URL("../../", PackageEntrypointSmokeFixture.packageRoot);
  private static hasBuiltPackage = false;

  static resolvePath(relativePath: string): string {
    return new URL(relativePath, this.packageRoot).pathname;
  }

  static resolveWorkspacePath(relativePath: string): string {
    return new URL(relativePath, this.workspaceRoot).pathname;
  }

  static ensurePackageBuild(): void {
    if (this.hasBuiltPackage) {
      return;
    }
    execFileSync("pnpm", ["--filter", "@codemation/core", "build"], {
      cwd: this.resolveWorkspacePath("./"),
      stdio: "pipe",
    });
    execFileSync("pnpm", ["build"], {
      cwd: this.resolvePath("./"),
      stdio: "pipe",
    });
    this.hasBuiltPackage = true;
  }
}

test("build emits the declared root entrypoints", () => {
  PackageEntrypointSmokeFixture.ensurePackageBuild();
  assert.equal(existsSync(PackageEntrypointSmokeFixture.resolvePath("dist/index.js")), true);
  assert.equal(existsSync(PackageEntrypointSmokeFixture.resolvePath("dist/index.cjs")), true);
  assert.equal(existsSync(PackageEntrypointSmokeFixture.resolvePath("dist/index.d.ts")), true);
  assert.equal(existsSync(PackageEntrypointSmokeFixture.resolvePath("dist/codemation.plugin.js")), true);
});

test("Node ESM can import the package root by name after build", () => {
  PackageEntrypointSmokeFixture.ensurePackageBuild();
  const output = execFileSync(
    "node",
    [
      "--input-type=module",
      "-e",
      "import('@codemation/core-nodes-ocr').then((module) => { console.log(String('analyzeInvoiceNode' in module)); });",
    ],
    {
      cwd: PackageEntrypointSmokeFixture.resolvePath("./"),
      encoding: "utf8",
    },
  ).trim();
  assert.equal(output, "true");
});
