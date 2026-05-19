/**
 * Behavioral tests for ConsoleLogger.
 * Covers: filtered log (shouldEmit=false), log with exception, all level methods.
 */
import { describe, expect, it } from "vitest";
import { ConsoleLogger } from "../../src/infrastructure/logging/ConsoleLogger";

function makePolicyAlwaysEmit() {
  return { shouldEmit: () => true };
}

function makePolicyNeverEmit() {
  return { shouldEmit: () => false };
}

describe("ConsoleLogger", () => {
  it("does not log when shouldEmit returns false", () => {
    const calls: unknown[] = [];
    const original = console.info;
    console.info = (...args: unknown[]) => calls.push(args);
    try {
      const logger = new ConsoleLogger("test.ns", makePolicyNeverEmit() as never);
      logger.info("should be filtered");
      expect(calls).toHaveLength(0);
    } finally {
      console.info = original;
    }
  });

  it("logs a plain message when shouldEmit returns true", () => {
    const calls: unknown[][] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => calls.push(args);
    try {
      const logger = new ConsoleLogger("test.ns", makePolicyAlwaysEmit() as never);
      logger.warn("hello world");
      expect(calls).toHaveLength(1);
      expect(String(calls[0]![0])).toContain("hello world");
    } finally {
      console.warn = original;
    }
  });

  it("logs a message with exception when exception provided", () => {
    const calls: unknown[][] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => calls.push(args);
    try {
      const err = new Error("test error");
      const logger = new ConsoleLogger("test.ns", makePolicyAlwaysEmit() as never);
      logger.error("something failed", err);
      expect(calls).toHaveLength(1);
      expect(calls[0]![1]).toBe(err);
    } finally {
      console.error = original;
    }
  });

  it("debug level logs when shouldEmit returns true", () => {
    const calls: unknown[][] = [];
    const original = console.debug;
    console.debug = (...args: unknown[]) => calls.push(args);
    try {
      const logger = new ConsoleLogger("test.ns", makePolicyAlwaysEmit() as never);
      logger.debug("debug message");
      expect(calls).toHaveLength(1);
    } finally {
      console.debug = original;
    }
  });

  it("info level logs when shouldEmit returns true", () => {
    const calls: unknown[][] = [];
    const original = console.info;
    console.info = (...args: unknown[]) => calls.push(args);
    try {
      const logger = new ConsoleLogger("test.ns", makePolicyAlwaysEmit() as never);
      logger.info("info message");
      expect(calls).toHaveLength(1);
    } finally {
      console.info = original;
    }
  });
});
