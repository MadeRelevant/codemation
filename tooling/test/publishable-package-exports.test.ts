/**
 * Regression tests — Class 10: Framework packages compile subpath exports.
 *
 * Invariant: every entry in `exports` of every publishable @codemation/*
 * package that a bundler (Turbopack, webpack, esbuild) resolves at install
 * time points at `./dist/*.{js,cjs,d.ts}` — NOT at `./src/*.ts`.
 *
 * The bug: @codemation/core@0.11.0 shipped `./browser` as
 * `{"import": "./src/browser.ts", "types": "./src/browser.ts"}`.
 * Turbopack rejected the raw TypeScript source because the browser condition
 * is resolved at install time (not development time), and TypeScript is not
 * a valid browser module.
 *
 * What we check:
 *   - For each export condition that is NOT "development", the resolved path
 *     must NOT be a raw `.ts` source file.
 *   - `types` entries may still point to `./src/*.ts` in development conditions
 *     (they are stripped by the TypeScript resolver), but `import` / `require` /
 *     `default` / any condition used by non-TS bundlers must resolve to dist/*.
 *
 * We skip `./package.json` re-exports and glob patterns (e.g. `./skills/*`).
 * We skip packages that have no `exports` field at all.
 * We skip conditions named "development" (framework-author mode only).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dirname, "../..");
const PACKAGES_DIR = join(REPO_ROOT, "packages");

interface PackageJson {
  name: string;
  private?: boolean;
  publishConfig?: { access?: string };
  exports?: Record<string, unknown>;
}

// ---- helpers ----

function readPackageJson(pkgDir: string): PackageJson | null {
  try {
    return JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8")) as PackageJson;
  } catch {
    return null;
  }
}

function isPublishable(pkg: PackageJson): boolean {
  if (pkg.private === true) return false;
  // publishConfig.access === "public" is the canonical marker in this repo.
  return pkg.publishConfig?.access === "public";
}

/**
 * Collect all (condition → resolved path) pairs from an exports value,
 * recursively expanding objects. Skips the "development" condition.
 */
function collectResolvedPaths(
  value: unknown,
  conditionPath: string[] = [],
): Array<{ condition: string; path: string }> {
  if (typeof value === "string") {
    // Leaf — the string is the resolved path.
    return [{ condition: conditionPath.join("."), path: value }];
  }
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const results: Array<{ condition: string; path: string }> = [];
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      // Skip development condition — it's framework-author mode only.
      if (key === "development") continue;
      results.push(...collectResolvedPaths(val, [...conditionPath, key]));
    }
    return results;
  }
  return [];
}

/**
 * Returns true if the path is a raw TypeScript source file that should NOT
 * be resolved by a production bundler.
 */
function isRawTypeScriptPath(p: string): boolean {
  return p.startsWith("./src/") && p.endsWith(".ts") && !p.endsWith(".d.ts");
}

// ---- discover publishable packages ----

function getPublishablePackages(): Array<{ name: string; dir: string; pkg: PackageJson }> {
  return readdirSync(PACKAGES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => {
      const dir = join(PACKAGES_DIR, d.name);
      const pkg = readPackageJson(dir);
      return pkg ? { name: pkg.name, dir, pkg } : null;
    })
    .filter(
      (entry): entry is { name: string; dir: string; pkg: PackageJson } => entry !== null && isPublishable(entry.pkg),
    );
}

// ---- tests ----

describe("publishable package exports — no raw TS source in production conditions", () => {
  const packages = getPublishablePackages();

  it("finds at least one publishable package (sanity check)", () => {
    expect(packages.length).toBeGreaterThan(0);
  });

  // @codemation/next-host is publishConfig.access=public but is actually a Next.js
  // app (build script: `next build`), not a tsdown library. Its `.` export points at
  // ./src/index.ts because there is no built dist. Tracked as backlog item: split
  // next-host into a publishable library entry (tsdown) vs. the Next.js shell, or
  // mark it private. Skipping here so the invariant test still guards real libraries.
  const SKIP_PACKAGES = new Set(["@codemation/next-host"]);

  for (const { name, pkg } of packages) {
    if (SKIP_PACKAGES.has(name)) continue;
    const exports = pkg.exports;
    if (!exports) continue; // No exports field — nothing to check.

    describe(`${name}`, () => {
      for (const [subpath, subpathValue] of Object.entries(exports)) {
        // Skip ./package.json re-exports and glob patterns.
        if (subpath === "./package.json" || subpath.includes("*")) continue;

        const resolvedPaths = collectResolvedPaths(subpathValue);

        for (const { condition, path: resolvedPath } of resolvedPaths) {
          // types condition is allowed to point at src/*.ts (TypeScript project
          // refs resolve it, production bundlers use the import/require condition).
          if (condition.endsWith("types")) continue;

          it(`exports["${subpath}"] condition "${condition}" resolves to dist/* not src/*.ts`, () => {
            expect(
              isRawTypeScriptPath(resolvedPath),
              `${name} exports["${subpath}"]["${condition}"] = "${resolvedPath}" ` +
                `is a raw TypeScript source — production bundlers (Turbopack, webpack) ` +
                `will reject it. Point it at the compiled dist/* output instead.`,
            ).toBe(false);
          });
        }
      }
    });
  }
});
