import { describe, expect, it } from "vitest";
import { SourceMapNodeOptions } from "../src/runtime/SourceMapNodeOptions";

describe("SourceMapNodeOptions", () => {
  const opts = new SourceMapNodeOptions();

  it("returns --enable-source-maps when existingNodeOptions is undefined", () => {
    expect(opts.appendToNodeOptions(undefined)).toBe("--enable-source-maps");
  });

  it("returns --enable-source-maps when existingNodeOptions is empty", () => {
    expect(opts.appendToNodeOptions("")).toBe("--enable-source-maps");
  });

  it("returns --enable-source-maps when existingNodeOptions is whitespace only", () => {
    expect(opts.appendToNodeOptions("   ")).toBe("--enable-source-maps");
  });

  it("returns existing options unchanged when --enable-source-maps already present", () => {
    expect(opts.appendToNodeOptions("--enable-source-maps")).toBe("--enable-source-maps");
  });

  it("appends --enable-source-maps to existing options", () => {
    expect(opts.appendToNodeOptions("--some-flag")).toBe("--some-flag --enable-source-maps");
  });
});
