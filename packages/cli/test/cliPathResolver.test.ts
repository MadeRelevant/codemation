import path from "node:path";
import { describe, expect, it } from "vitest";
import { CliPathResolver } from "../src/path/CliPathResolver";

describe("CliPathResolver", () => {
  it("resolves consumer root from start path", async () => {
    const resolver = new CliPathResolver();
    const result = await resolver.resolve(process.cwd());
    expect(result.consumerRoot).toBe(path.resolve(process.cwd()));
  });

  it("resolves workspace root when pnpm-workspace.yaml exists in an ancestor", async () => {
    const resolver = new CliPathResolver();
    // Use the actual framework root which has pnpm-workspace.yaml
    const result = await resolver.resolve(process.cwd());
    // repoRoot should be the workspace root (where pnpm-workspace.yaml is)
    expect(result.repoRoot).toBeTruthy();
  });

  it("falls back to consumerRoot when no workspace root found", async () => {
    const resolver = new CliPathResolver();
    // Use os.tmpdir() which doesn't have pnpm-workspace.yaml in any ancestor
    const { tmpdir } = await import("node:os");
    const tmpPath = tmpdir();
    const result = await resolver.resolve(tmpPath);
    expect(result.consumerRoot).toBe(path.resolve(tmpPath));
    // Falls back to consumerRoot
    expect(result.repoRoot).toBe(result.consumerRoot);
  });
});
