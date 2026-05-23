/**
 * Contract test for useWorkflowPinController.
 *
 * The type assertions below fail at tsc time if the hook's return type drifts from
 * WorkflowPinControllerReturn.
 */
import { describe, it, expect } from "vitest";
import { useWorkflowPinController } from "../../src/hooks/workflowDetail/useWorkflowPinController";
import type { WorkflowPinControllerReturn } from "../../src/types/workflowDetail/WorkflowPinControllerReturn.types";

type _AssignableToInterface =
  ReturnType<typeof useWorkflowPinController> extends WorkflowPinControllerReturn ? true : never;
type _InterfaceAssignableToReturn =
  WorkflowPinControllerReturn extends ReturnType<typeof useWorkflowPinController> ? true : never;
const _contract1: _AssignableToInterface = true;
const _contract2: _InterfaceAssignableToReturn = true;
void _contract1;
void _contract2;

describe("useWorkflowPinController contract", () => {
  it("is exported as a function", () => {
    expect(typeof useWorkflowPinController).toBe("function");
  });
});
