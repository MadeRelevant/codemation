import type { CredentialSessionService } from "../contracts/credentialTypes";

/**
 * Test harness default: rejects any credential lookup so missing bindings fail loudly.
 * Prefer registering a real {@link CredentialSessionService} in integration scenarios.
 */
export class RejectingCredentialSessionService implements CredentialSessionService {
  async getSession<TSession = unknown>(
    args: Readonly<{ workflowId: string; nodeId: string; slotKey: string }>,
  ): Promise<TSession> {
    throw new Error(
      `Credential sessions are unavailable for workflow ${args.workflowId} node ${args.nodeId} slot "${args.slotKey}". Register a real CredentialSessionService implementation before executing workflows.`,
    );
  }
}
