/**
 * Contract test for useWorkflowInspectController.
 *
 * The type assertions below fail at tsc time if the hook's return type drifts from
 * WorkflowInspectControllerReturn.
 */
import { describe, it, expect } from "vitest";
import { useWorkflowInspectController } from "../../src/hooks/workflowDetail/useWorkflowInspectController";
import type { WorkflowInspectControllerReturn } from "../../src/types/workflowDetail/WorkflowInspectControllerReturn.types";

type _AssignableToInterface =
  ReturnType<typeof useWorkflowInspectController> extends WorkflowInspectControllerReturn ? true : never;
type _InterfaceAssignableToReturn =
  WorkflowInspectControllerReturn extends ReturnType<typeof useWorkflowInspectController> ? true : never;
const _contract1: _AssignableToInterface = true;
const _contract2: _InterfaceAssignableToReturn = true;
void _contract1;
void _contract2;

describe("useWorkflowInspectController contract", () => {
  it("is exported as a function", () => {
    expect(typeof useWorkflowInspectController).toBe("function");
  });
});
