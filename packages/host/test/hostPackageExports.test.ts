import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "vitest";

test("@codemation/host exports package.json for packaged consumers", () => {
  const packageJsonPath = path.resolve(import.meta.dirname, "..", "package.json");
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
    exports?: Record<string, unknown>;
  };

  assert.equal(packageJson.exports?.["./package.json"], "./package.json");
});

test("@codemation/host exports the lightweight authoring subpath", () => {
  const packageJsonPath = path.resolve(import.meta.dirname, "..", "package.json");
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
    exports?: Record<string, unknown>;
  };
  const authoringExport = packageJson.exports?.["./authoring"] as
    | Readonly<{ types?: string; development?: Readonly<{ import?: string }>; import?: string }>
    | undefined;

  assert.deepEqual(authoringExport, {
    types: "./dist/authoring.d.ts",
    development: {
      import: "./src/authoring.ts",
    },
    import: "./dist/authoring.js",
  });
});
