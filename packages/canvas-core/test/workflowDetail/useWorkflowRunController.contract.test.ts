/**
 * Contract test for useWorkflowRunController.
 *
 * Primary contract: TypeScript structural typing.
 * The type assertion below fails at tsc time if the hook's return type drifts from
 * WorkflowRunControllerReturn — catches extra/missing fields before any runtime tests run.
 */
import { describe, it, expect } from "vitest";
import { useWorkflowRunController } from "../../src/hooks/workflowDetail/useWorkflowRunController";
import type { WorkflowRunControllerReturn } from "../../src/types/workflowDetail/WorkflowRunControllerReturn.types";

// Compile-time structural compatibility check.
// ReturnType must be assignable to the declared interface in BOTH directions.
type _AssignableToInterface =
  ReturnType<typeof useWorkflowRunController> extends WorkflowRunControllerReturn ? true : never;
type _InterfaceAssignableToReturn =
  WorkflowRunControllerReturn extends ReturnType<typeof useWorkflowRunController> ? true : never;
const _contract1: _AssignableToInterface = true;
const _contract2: _InterfaceAssignableToReturn = true;
void _contract1;
void _contract2;

describe("useWorkflowRunController contract", () => {
  it("is exported as a function", () => {
    expect(typeof useWorkflowRunController).toBe("function");
  });
});
