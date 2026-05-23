import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const examplesDir = path.resolve(__dirname, "../src/examples");

function collectExampleFiles(): Array<{ name: string; path: string }> {
  if (!existsSync(examplesDir)) return [];
  return readdirSync(examplesDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".example.ts") && !entry.name.endsWith(".skip"))
    .map((entry) => ({ name: entry.name, path: path.join(examplesDir, entry.name) }));
}

function hasRequiredFrontmatter(source: string): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!/@description\s+\S/.test(source)) missing.push("@description");
  if (!/@tags\s+\S/.test(source)) missing.push("@tags");
  return { ok: missing.length === 0, missing };
}

test("frontmatter parser runs without errors when no examples exist", () => {
  // Confirms the directory scan doesn't throw even when empty.
  const files = collectExampleFiles();
  assert.ok(Array.isArray(files));
});

test("every .example.ts file has @description and @tags frontmatter", () => {
  const files = collectExampleFiles();
  const violations: string[] = [];

  for (const file of files) {
    const source = readFileSync(file.path, "utf8");
    const { ok, missing } = hasRequiredFrontmatter(source);
    if (!ok) {
      violations.push(`${file.name}: missing tags: ${missing.join(", ")}`);
    }
  }

  assert.deepEqual(
    violations,
    [],
    `Some example files are missing required JSDoc frontmatter:\n${violations.join("\n")}`,
  );
});
