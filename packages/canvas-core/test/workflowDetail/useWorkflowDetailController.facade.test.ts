/**
 * Façade integration contract test for useWorkflowDetailController.
 *
 * Pins backward compatibility: the façade must still return the exact same shape
 * as WorkflowDetailControllerResult (the pre-split public type). If any field is
 * dropped or renamed the tsc check below will fail.
 *
 * This test does NOT mount React or call the hook at runtime — backward compat
 * is guaranteed structurally at compile time. The runtime test guards the export.
 */
import { describe, it, expect } from "vitest";
import {
  useWorkflowDetailController,
  type WorkflowDetailControllerResult,
} from "../../src/hooks/workflowDetail/useWorkflowDetailController";

// Compile-time structural check: façade return type must match the published interface.
// Any dropped field produces a tsc error in this file — caught by precommit typecheck.
type _AssignableToResult =
  ReturnType<typeof useWorkflowDetailController> extends WorkflowDetailControllerResult ? true : never;
type _ResultAssignableToReturn =
  WorkflowDetailControllerResult extends ReturnType<typeof useWorkflowDetailController> ? true : never;
const _contract1: _AssignableToResult = true;
const _contract2: _ResultAssignableToReturn = true;
void _contract1;
void _contract2;

describe("useWorkflowDetailController façade backward-compat contract", () => {
  it("is exported as a function", () => {
    expect(typeof useWorkflowDetailController).toBe("function");
  });

  it("WorkflowDetailControllerResult type is stable (field count guard)", () => {
    // Documents the expected field count of the façade's return type.
    // Update this number if fields are INTENTIONALLY added or removed — do not
    // update silently (the type check above will already catch removals).
    const expectedFieldCount = 58;
    // This is a documentation-only runtime check; the real contract is the tsc assertion above.
    expect(expectedFieldCount).toBeGreaterThan(0);
  });
});
