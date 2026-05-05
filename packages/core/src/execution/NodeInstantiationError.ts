import type { NodeId } from "../types";

export class NodeInstantiationError extends Error {
  readonly name = "NodeInstantiationError";
  readonly originalError: Error;

  constructor(
    readonly nodeId: NodeId,
    readonly nodeType: string,
    originalError: Error,
  ) {
    super(`Failed to instantiate node "${nodeId}" (type ${nodeType}): ${originalError.message}`);
    this.originalError = originalError;
    this.stack = originalError.stack;
  }
}
