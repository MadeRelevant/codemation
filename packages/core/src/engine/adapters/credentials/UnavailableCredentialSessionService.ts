import type { CredentialSessionService } from "../../../contracts/credentialTypes";

export class UnavailableCredentialSessionService implements CredentialSessionService {
  async getSession<TSession = unknown>(args: Readonly<{ workflowId: string; nodeId: string; slotKey: string }>): Promise<TSession> {
    throw new Error(
      `Credential sessions are unavailable for workflow ${args.workflowId} node ${args.nodeId} slot "${args.slotKey}". Register a CredentialSessionService implementation before executing workflows.`,
    );
  }
}

