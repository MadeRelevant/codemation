import type { CredentialSessionService, NodeExecutionContext, NodeId, WorkflowId } from "../../../types";

export class CredentialResolverFactory {
  constructor(private readonly credentialSessions: CredentialSessionService) {}

  create(
    workflowId: WorkflowId,
    nodeId: NodeId,
    config?: NodeExecutionContext["config"],
  ): NodeExecutionContext["getCredential"] {
    const acceptedTypesBySlot = new Map<string, ReadonlyArray<string>>();
    for (const requirement of config?.getCredentialRequirements?.() ?? []) {
      acceptedTypesBySlot.set(requirement.slotKey, requirement.acceptedTypes);
    }

    return async <TSession = unknown>(slotKey: string): Promise<TSession> => {
      try {
        return await this.credentialSessions.getSession<TSession>({
          workflowId,
          nodeId,
          slotKey,
        });
      } catch (error) {
        const acceptedTypes = acceptedTypesBySlot.get(slotKey) ?? [];
        const message = error instanceof Error ? error.message : String(error);
        const acceptedTypesSuffix = acceptedTypes.length > 0 ? ` Accepted types: ${acceptedTypes.join(", ")}.` : "";
        throw new Error(
          `Failed to resolve credential for workflow ${workflowId} node ${nodeId} slot "${slotKey}". ${message}${acceptedTypesSuffix}`,
          { cause: error },
        );
      }
    };
  }
}

