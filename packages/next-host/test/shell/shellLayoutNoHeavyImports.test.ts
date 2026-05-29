import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";

// Regression guard: the `(shell)/layout.tsx` Server Component must NOT import
// devInboxComposition / CodemationNextHost. Doing so transitively pulls in
// the host DI graph (FrontendRuntime -> DatabaseMigrations -> PrismaMigrationDeployer)
// which trips Turbopack's NFT module tracer with "whole project was traced
// unintentionally" and fails the CI build guard. The layout determines
// `isNonManaged` from process.env directly to keep this graph small.
describe("(shell)/layout.tsx — no heavy DI imports", () => {
  const layoutPath = path.resolve(import.meta.dirname, "..", "..", "app", "(shell)", "layout.tsx");

  function extractImportLines(source: string): string[] {
    return source.split("\n").filter((line) => /^\s*import\s/.test(line));
  }

  test("does not import CodemationNextHost", async () => {
    const source = await readFile(layoutPath, "utf8");
    const imports = extractImportLines(source).join("\n");
    expect(imports).not.toMatch(/CodemationNextHost/);
  });

  test("does not import devInboxComposition", async () => {
    const source = await readFile(layoutPath, "utf8");
    const imports = extractImportLines(source).join("\n");
    expect(imports).not.toMatch(/devInboxComposition/);
  });

  test("reads pairing env vars directly to drive isNonManaged", async () => {
    const source = await readFile(layoutPath, "utf8");
    expect(source).toMatch(/WORKSPACE_ID/);
    expect(source).toMatch(/WORKSPACE_PAIRING_SECRET/);
    expect(source).toMatch(/CONTROL_PLANE_URL/);
    expect(source).toMatch(/isNonManaged/);
  });
});
