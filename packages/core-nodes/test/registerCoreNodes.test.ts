/**
 * Smoke test for registerCoreNodes.
 * Verifies the function is callable with a container (real or stub) and does not throw.
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { registerCoreNodes } from "../src/register.types";

describe("registerCoreNodes", () => {
  it("executes without throwing when called with a stub container", () => {
    // A minimal stub that satisfies the Container interface enough for registerCoreNodes.
    const stubContainer = {} as Parameters<typeof registerCoreNodes>[0];
    assert.doesNotThrow(() => registerCoreNodes(stubContainer));
  });

  it("is a function that accepts a container argument", () => {
    assert.equal(typeof registerCoreNodes, "function");
    assert.equal(registerCoreNodes.length, 1);
  });
});
