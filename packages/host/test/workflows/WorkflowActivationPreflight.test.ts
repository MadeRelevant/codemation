/**
 * Behavioral tests for WorkflowActivationPreflight.
 * Tests the assertCanActivate method including error paths.
 */
import { describe, expect, it } from "vitest";
import { WorkflowActivationPreflight } from "../../src/domain/workflows/WorkflowActivationPreflight";

function makeWorkflowRepository(workflow: object | null = null) {
  return { get: () => workflow };
}

function makeCredentialBindingService(health: object = { workflowId: "wf-1", slots: [] }) {
  return { listWorkflowHealth: async () => health };
}

function makeRules(triggerErrors: string[] = [], credErrors: string[] = []) {
  return {
    collectNonManualTriggerErrors: () => triggerErrors,
    collectRequiredCredentialErrors: () => credErrors,
  };
}

describe("WorkflowActivationPreflight.assertCanActivate", () => {
  it("throws 404 when workflow is not found", async () => {
    const preflight = new WorkflowActivationPreflight(
      makeWorkflowRepository(null) as never,
      makeCredentialBindingService() as never,
      makeRules() as never,
    );
    await expect(preflight.assertCanActivate("wf-missing")).rejects.toMatchObject({ status: 404 });
  });

  it("does not throw when no errors", async () => {
    const workflow = { id: "wf-1", name: "Test", nodes: [], edges: [] };
    const preflight = new WorkflowActivationPreflight(
      makeWorkflowRepository(workflow) as never,
      makeCredentialBindingService() as never,
      makeRules([], []) as never,
    );
    await expect(preflight.assertCanActivate("wf-1")).resolves.not.toThrow();
  });

  it("throws 400 when there are trigger errors", async () => {
    const workflow = { id: "wf-1", name: "Test", nodes: [], edges: [] };
    const preflight = new WorkflowActivationPreflight(
      makeWorkflowRepository(workflow) as never,
      makeCredentialBindingService() as never,
      makeRules(["No valid trigger"], []) as never,
    );
    await expect(preflight.assertCanActivate("wf-1")).rejects.toMatchObject({ status: 400 });
  });

  it("throws 400 when there are credential errors", async () => {
    const workflow = { id: "wf-1", name: "Test", nodes: [], edges: [] };
    const preflight = new WorkflowActivationPreflight(
      makeWorkflowRepository(workflow) as never,
      makeCredentialBindingService() as never,
      makeRules([], ["Required credential not bound"]) as never,
    );
    await expect(preflight.assertCanActivate("wf-1")).rejects.toMatchObject({ status: 400 });
  });

  it("handles URL-encoded workflowId", async () => {
    const workflow = { id: "wf/1", name: "Test", nodes: [], edges: [] };
    const preflight = new WorkflowActivationPreflight(
      makeWorkflowRepository(workflow) as never,
      makeCredentialBindingService({ workflowId: "wf/1", slots: [] }) as never,
      makeRules() as never,
    );
    await expect(preflight.assertCanActivate("wf%2F1")).resolves.not.toThrow();
  });
});
