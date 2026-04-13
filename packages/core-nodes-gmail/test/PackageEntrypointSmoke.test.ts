import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { test } from "vitest";

class PackageEntrypointSmokeFixture {
  static readonly packageRoot = new URL("../", import.meta.url);
  /** Monorepo root (…/packages/core-nodes-gmail → repo root). */
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
    // Built Gmail `dist` imports `@codemation/core` at runtime; Changesets runs tests without a full turbo build.
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
  PackageEntrypointSmokeFixture.ensurePackageBuild();
  execFileSync("pnpm", ["exec", "tsc", "-p", "test/fixtures/consumer-tsconfig.json", "--noEmit"], {
    cwd: PackageEntrypointSmokeFixture.resolvePath("./"),
    stdio: "pipe",
  });
});
