#!/usr/bin/env tsx
/**
 * Build-time script: extracts package metadata and writes `dist/metadata.json`.
 * Invoked from each curated package's `build:metadata` script.
 * Runs in the package's root directory (`process.cwd()`).
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { PackageMetadataExtractor } from "../PackageMetadataExtractor.js";

const packageRoot = process.cwd();
const extractor = new PackageMetadataExtractor();

let metadata;
try {
  metadata = extractor.extract(packageRoot);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[extract-metadata] Failed to extract metadata for ${packageRoot}: ${message}\n`);
  process.exit(1);
}

const distDir = path.join(packageRoot, "dist");
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

const outPath = path.join(distDir, "metadata.json");
fs.writeFileSync(outPath, JSON.stringify(metadata, null, 2) + "\n", "utf8");
process.stdout.write(
  `[extract-metadata] wrote ${outPath} (${metadata.nodes?.length ?? 0} nodes, ${metadata.credentials?.length ?? 0} credentials, ${metadata.examples?.length ?? 0} examples)\n`,
);
