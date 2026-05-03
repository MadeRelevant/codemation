#!/usr/bin/env node

/**
 * Check circular dependencies against baseline counts.
 * Ensures Phase 1 structural improvements don't regress.
 *
 * Baseline (current counts):
 * - core: 50 (improved from 53 by extracting baseTypes.ts)
 * - host: 21
 * - core-nodes: 73
 */

import { execSync } from "child_process";
import { resolve } from "path";

const baselines = {
  "packages/core": { max: 50 },
  "packages/host": { max: 21 },
  "packages/core-nodes": { max: 73 },
};

let exitCode = 0;

for (const [pkg, { max }] of Object.entries(baselines)) {
  try {
    const tsconfig = resolve(pkg, "tsconfig.json");
    const indexTs = resolve(pkg, "src/index.ts");

    let output = "";
    try {
      output = execSync(`pnpm exec madge --extensions ts,tsx --ts-config "${tsconfig}" --circular "${indexTs}" 2>&1`, {
        encoding: "utf-8",
        stdio: "pipe",
      });
    } catch (madgeErr) {
      // madge exits with non-zero when it finds circular deps, but still outputs
      output = (madgeErr.stdout || madgeErr.stderr || madgeErr.message || "").toString();
    }

    const match = output.match(/Found (\d+) circular dependencies/);
    const count = match ? parseInt(match[1], 10) : 0;

    if (count <= max) {
      console.log(`✔ ${pkg}: ${count} circular deps (baseline: ${max})`);
    } else {
      console.error(`✗ ${pkg}: ${count} circular deps exceeds baseline of ${max}`);
      exitCode = 1;
    }
  } catch (err) {
    console.error(`✗ ${pkg}: failed to check circular deps`, err.message);
    exitCode = 1;
  }
}

process.exit(exitCode);
