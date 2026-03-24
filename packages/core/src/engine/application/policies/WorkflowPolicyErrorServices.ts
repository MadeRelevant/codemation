import type { TypeToken } from "../../../di";
import type {
  NodeErrorHandler,
  NodeErrorHandlerSpec,
  NodeResolver,
  WorkflowErrorHandler,
  WorkflowErrorHandlerSpec,
} from "../../../types";

export class WorkflowPolicyErrorServices {
  constructor(private readonly nodeResolver: NodeResolver) {}

  resolveNodeErrorHandler(spec: NodeErrorHandlerSpec | undefined): NodeErrorHandler | undefined {
    if (!spec) return undefined;
    if (typeof spec === "object" && spec !== null && "handle" in spec && typeof (spec as NodeErrorHandler).handle === "function") {
      return spec as NodeErrorHandler;
    }
    return this.nodeResolver.resolve(spec as TypeToken<NodeErrorHandler>);
  }

  resolveWorkflowErrorHandler(spec: WorkflowErrorHandlerSpec | undefined): WorkflowErrorHandler | undefined {
    if (!spec) return undefined;
    if (typeof spec === "object" && spec !== null && "onError" in spec && typeof (spec as WorkflowErrorHandler).onError === "function") {
      return spec as WorkflowErrorHandler;
    }
    return this.nodeResolver.resolve(spec as TypeToken<WorkflowErrorHandler>);
  }
}
