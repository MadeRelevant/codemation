import type { WorkflowId } from "./workflowTypes";

/**
 * Host-controlled policy: when false, trigger {@link TriggerNode} setup is skipped and webhook routes
 * for that workflow are not registered (see engine trigger runtime + webhook matcher).
 */
export interface WorkflowActivationPolicy {
  isActive(workflowId: WorkflowId): boolean;
}

/** Default for tests and harnesses: every workflow is treated as active (legacy behavior). */
export class AllWorkflowsActiveWorkflowActivationPolicy implements WorkflowActivationPolicy {
  isActive(_workflowId: WorkflowId): boolean {
    return true;
  }
}
