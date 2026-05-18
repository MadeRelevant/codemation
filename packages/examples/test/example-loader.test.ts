import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const examplesDir = path.resolve(__dirname, "../src/examples");

function collectExampleFiles(): string[] {
  if (!existsSync(examplesDir)) return [];
  return readdirSync(examplesDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".example.ts"))
    .map((entry) => entry.name);
}

test("src/examples directory exists", () => {
  assert.ok(existsSync(examplesDir), `Expected ${examplesDir} to exist`);
});

test("glob picks up .example.ts files and skips .skip-suffixed files", () => {
  const all = existsSync(examplesDir)
    ? readdirSync(examplesDir, { withFileTypes: true })
        .filter((e) => e.isFile())
        .map((e) => e.name)
    : [];

  const skipFiles = all.filter((n) => n.endsWith(".skip"));
  const exampleFiles = collectExampleFiles();

  // Skip files must not appear in the discovered list
  for (const skip of skipFiles) {
    assert.ok(!exampleFiles.includes(skip), `Skip file ${skip} must not be included in discovered examples`);
  }

  // No .example.ts file should have a .skip suffix (they end in .ts.skip, not .example.ts)
  for (const discovered of exampleFiles) {
    assert.ok(discovered.endsWith(".example.ts"), `${discovered} must end in .example.ts`);
    assert.ok(!discovered.endsWith(".skip"), `${discovered} must not end in .skip`);
  }
});

test("template file with .skip suffix is excluded from discovery", () => {
  const templateSkip = "_template.example.ts.skip";
  const exampleFiles = collectExampleFiles();
  assert.ok(!exampleFiles.includes(templateSkip), "Template .skip file must not appear in discovered examples");
});
