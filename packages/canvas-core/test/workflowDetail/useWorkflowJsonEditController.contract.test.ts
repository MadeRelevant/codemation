/**
 * Contract test for useWorkflowJsonEditController.
 *
 * The type assertions below fail at tsc time if the hook's return type drifts from
 * WorkflowJsonEditControllerReturn.
 */
import { describe, it, expect } from "vitest";
import { useWorkflowJsonEditController } from "../../src/hooks/workflowDetail/useWorkflowJsonEditController";
import type { WorkflowJsonEditControllerReturn } from "../../src/types/workflowDetail/WorkflowJsonEditControllerReturn.types";

type _AssignableToInterface =
  ReturnType<typeof useWorkflowJsonEditController> extends WorkflowJsonEditControllerReturn ? true : never;
type _InterfaceAssignableToReturn =
  WorkflowJsonEditControllerReturn extends ReturnType<typeof useWorkflowJsonEditController> ? true : never;
const _contract1: _AssignableToInterface = true;
const _contract2: _InterfaceAssignableToReturn = true;
void _contract1;
void _contract2;

describe("useWorkflowJsonEditController contract", () => {
  it("is exported as a function", () => {
    expect(typeof useWorkflowJsonEditController).toBe("function");
  });
});
