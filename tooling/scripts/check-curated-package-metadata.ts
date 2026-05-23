#!/usr/bin/env tsx
/**
 * CI gate: checks that every package in `curated-packages.json` has a valid
 * `dist/metadata.json`. Exits non-zero if any are missing or invalid.
 *
 * Packages whose local directory does not yet exist are skipped with a warning
 * (placeholder entries for packages not yet created, e.g. @codemation/examples
 * before Story B lands). Once the directory exists, the check becomes strict.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { PackageMetadataValidator } from "../discovery/PackageMetadataValidator.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../..");
const CURATED_LIST_PATH = path.join(REPO_ROOT, "tooling/discovery/curated-packages.json");

const validator = new PackageMetadataValidator();

function run(): void {
  const curatedList = JSON.parse(fs.readFileSync(CURATED_LIST_PATH, "utf8")) as {
    packages: string[];
    _pendingPackages?: string[];
  };
  const pendingSet = new Set(curatedList._pendingPackages ?? []);
  const problems: string[] = [];
  const skipped: string[] = [];

  for (const pkgName of curatedList.packages) {
    // npm package name → local package directory
    // e.g. "@codemation/core-nodes" → "packages/core-nodes"
    const localDirName = pkgName.replace(/^@codemation\//, "");
    const pkgDir = path.join(REPO_ROOT, "packages", localDirName);
    const metadataPath = path.join(pkgDir, "dist", "metadata.json");

    if (!fs.existsSync(pkgDir)) {
      if (pendingSet.has(pkgName)) {
        // Known placeholder (e.g. @codemation/examples before Story B lands) — skip with warning.
        skipped.push(pkgName);
        continue;
      }
      // Unknown package — fail hard.
      problems.push(`${pkgName}: package directory not found at ${pkgDir}`);
      continue;
    }

    if (!fs.existsSync(metadataPath)) {
      problems.push(`${pkgName}: dist/metadata.json does not exist (run 'pnpm --filter ${pkgName} build:metadata')`);
      continue;
    }

    let metadata: unknown;
    try {
      metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
    } catch {
      problems.push(`${pkgName}: dist/metadata.json is not valid JSON`);
      continue;
    }

    const result = validator.validate(metadata);
    if (!result.valid) {
      for (const error of result.errors) {
        problems.push(`${pkgName}: ${error}`);
      }
    }
  }

  if (skipped.length > 0) {
    process.stdout.write(
      `[check:metadata] skipped ${skipped.length} placeholder package(s) (directory not yet created): ${skipped.join(", ")}\n`,
    );
  }

  if (problems.length > 0) {
    process.stderr.write("\n[check:metadata] FAILED — curated package metadata problems:\n");
    for (const problem of problems) {
      process.stderr.write(`  • ${problem}\n`);
    }
    process.stderr.write("\n");
    process.exit(1);
  }

  const checked = curatedList.packages.length - skipped.length;
  process.stdout.write(`[check:metadata] OK — ${checked} curated package(s) have valid metadata.json\n`);
}

run();
