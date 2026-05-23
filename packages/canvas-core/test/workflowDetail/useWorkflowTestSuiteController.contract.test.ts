/**
 * Contract test for useWorkflowTestSuiteController.
 *
 * The type assertions below fail at tsc time if the hook's return type drifts from
 * WorkflowTestSuiteControllerReturn.
 */
import { describe, it, expect } from "vitest";
import { useWorkflowTestSuiteController } from "../../src/hooks/workflowDetail/useWorkflowTestSuiteController";
import type { WorkflowTestSuiteControllerReturn } from "../../src/types/workflowDetail/WorkflowTestSuiteControllerReturn.types";

type _AssignableToInterface =
  ReturnType<typeof useWorkflowTestSuiteController> extends WorkflowTestSuiteControllerReturn ? true : never;
type _InterfaceAssignableToReturn =
  WorkflowTestSuiteControllerReturn extends ReturnType<typeof useWorkflowTestSuiteController> ? true : never;
const _contract1: _AssignableToInterface = true;
const _contract2: _InterfaceAssignableToReturn = true;
void _contract1;
void _contract2;

describe("useWorkflowTestSuiteController contract", () => {
  it("is exported as a function", () => {
    expect(typeof useWorkflowTestSuiteController).toBe("function");
  });
});
