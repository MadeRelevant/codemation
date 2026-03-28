import type { NodeActivationRequest, NodeInputsByPort } from "../types";

export class NodeInputsByPortFactory {
  static empty(): NodeInputsByPort {
    return {};
  }

  static fromRequest(request: NodeActivationRequest): NodeInputsByPort {
    if (request.kind === "multi") {
      return request.inputsByPort;
    }
    return { in: request.input };
  }
}
