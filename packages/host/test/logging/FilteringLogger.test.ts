import { describe, expect, it, vi } from "vitest";
import type { Logger } from "../../src/application/logging/Logger";
import { FilteringLogger } from "../../src/infrastructure/logging/FilteringLogger";

function makeInner(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
}

describe("FilteringLogger", () => {
  it("drops messages when the filter returns false", () => {
    const inner = makeInner();
    const filtered = new FilteringLogger(inner, "scope", () => false);
    filtered.info("x");
    expect(inner.info).not.toHaveBeenCalled();
  });

  it("forwards info messages when the filter returns true", () => {
    const inner = makeInner();
    const filtered = new FilteringLogger(inner, "scope", () => true);
    filtered.info("hello");
    expect(inner.info).toHaveBeenCalledWith("hello", undefined);
  });

  it("forwards warn messages when the filter returns true", () => {
    const inner = makeInner();
    const filtered = new FilteringLogger(inner, "scope", () => true);
    filtered.warn("warning message");
    expect(inner.warn).toHaveBeenCalledWith("warning message", undefined);
  });

  it("filters warn messages when filter returns false", () => {
    const inner = makeInner();
    const filtered = new FilteringLogger(inner, "scope", () => false);
    filtered.warn("should be dropped");
    expect(inner.warn).not.toHaveBeenCalled();
  });

  it("forwards error messages with exception", () => {
    const inner = makeInner();
    const filtered = new FilteringLogger(inner, "scope", () => true);
    const err = new Error("boom");
    filtered.error("err message", err);
    expect(inner.error).toHaveBeenCalledWith("err message", err);
  });

  it("filters error messages when filter returns false", () => {
    const inner = makeInner();
    const filtered = new FilteringLogger(inner, "scope", () => false);
    filtered.error("should not pass");
    expect(inner.error).not.toHaveBeenCalled();
  });

  it("forwards debug messages", () => {
    const inner = makeInner();
    const filtered = new FilteringLogger(inner, "scope", () => true);
    filtered.debug("debug info");
    expect(inner.debug).toHaveBeenCalledWith("debug info", undefined);
  });

  it("filters debug messages when filter returns false", () => {
    const inner = makeInner();
    const filtered = new FilteringLogger(inner, "scope", () => false);
    filtered.debug("debug filtered");
    expect(inner.debug).not.toHaveBeenCalled();
  });

  it("passes scope and level to the filter function", () => {
    const inner = makeInner();
    const filterCalls: Array<{ scope: string; level: string; message: string }> = [];
    const filter = (args: { scope: string; level: string; message: string }) => {
      filterCalls.push(args);
      return true;
    };
    const filtered = new FilteringLogger(inner, "my-scope", filter);
    filtered.warn("test");
    expect(filterCalls[0]).toMatchObject({ scope: "my-scope", level: "warn", message: "test" });
  });
});
