import type { NodeActivationId, NodeId } from "../types";

export class NodeInputContractError extends Error {
  constructor(
    message: string,
    public readonly nodeId: NodeId,
    public readonly activationId: NodeActivationId,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "NodeInputContractError";
  }
}
