import { describe, expect, it, vi } from "vitest";
import type { Logger } from "../src/application/logging/Logger";
import { FilteringLogger } from "../src/infrastructure/logging/FilteringLogger";

describe("FilteringLogger", () => {
  it("drops messages when the filter returns false", () => {
    const inner: Logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };
    const filtered = new FilteringLogger(inner, "scope", () => false);
    filtered.info("x");
    expect(inner.info).not.toHaveBeenCalled();
  });

  it("forwards messages when the filter returns true", () => {
    const inner: Logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };
    const filtered = new FilteringLogger(inner, "scope", () => true);
    filtered.info("hello");
    expect(inner.info).toHaveBeenCalledWith("hello", undefined);
  });
});
