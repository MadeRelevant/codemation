import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { DEFAULT_ASSERTION_PASS_THRESHOLD, deriveAssertionPassed } from "../../src/contracts/assertionTypes";

describe("deriveAssertionPassed", () => {
  it("uses 0.5 as the default threshold when none is provided", () => {
    assert.equal(DEFAULT_ASSERTION_PASS_THRESHOLD, 0.5);
    assert.equal(deriveAssertionPassed({ score: 0.5 }), true);
    assert.equal(deriveAssertionPassed({ score: 0.49 }), false);
    assert.equal(deriveAssertionPassed({ score: 1 }), true);
    assert.equal(deriveAssertionPassed({ score: 0 }), false);
  });

  it("respects an explicit passThreshold", () => {
    // The "AI judge wants strictness" example: 0.6 with threshold 0.7 derives as fail.
    assert.equal(deriveAssertionPassed({ score: 0.6, passThreshold: 0.7 }), false);
    assert.equal(deriveAssertionPassed({ score: 0.7, passThreshold: 0.7 }), true);
    assert.equal(deriveAssertionPassed({ score: 0.71, passThreshold: 0.7 }), true);
  });

  it("treats `errored: true` as fail regardless of score", () => {
    assert.equal(deriveAssertionPassed({ score: 1, errored: true }), false);
    assert.equal(deriveAssertionPassed({ score: 0.99, passThreshold: 0.5, errored: true }), false);
  });
});
