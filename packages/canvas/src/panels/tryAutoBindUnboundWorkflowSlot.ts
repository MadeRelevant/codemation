import type { UpsertCredentialBindingRequest, WorkflowCredentialHealthSlotDto } from "@codemation/host/dto";

export function tryAutoBindUnboundWorkflowSlot(
  slot: WorkflowCredentialHealthSlotDto,
  instanceId: string,
  bindCredentialImpl: (request: UpsertCredentialBindingRequest) => Promise<void>,
  workflowId: string,
): void {
  if (slot.instance?.instanceId || instanceId.length === 0) {
    return;
  }
  void bindCredentialImpl({
    workflowId,
    nodeId: slot.nodeId,
    slotKey: slot.requirement.slotKey,
    instanceId,
  });
}
