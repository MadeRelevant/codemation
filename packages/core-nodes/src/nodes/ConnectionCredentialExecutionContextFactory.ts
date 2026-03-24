import type {
  CredentialRequirement,
  CredentialSessionService,
  NodeConfigBase,
  NodeExecutionContext,
  NodeId,
} from "@codemation/core";

import { CredentialResolverFactory } from "@codemation/core";

/**
 * Builds a {@link NodeExecutionContext} whose identity for credential binding and `getCredential`
 * is a **connection-owned** workflow node id (`ConnectionNodeIdFactory` in `@codemation/core`),
 * not the executing parent node. Use for LLM slots, tool slots, or any connection-scoped owner.
 */
export class ConnectionCredentialExecutionContextFactory {
  private readonly credentialResolverFactory: CredentialResolverFactory;

  constructor(credentialSessions: CredentialSessionService) {
    this.credentialResolverFactory = new CredentialResolverFactory(credentialSessions);
  }

  forConnectionNode<TConfig extends NodeConfigBase>(
    ctx: NodeExecutionContext<TConfig>,
    args: Readonly<{
      connectionNodeId: NodeId;
      getCredentialRequirements: () => ReadonlyArray<CredentialRequirement>;
    }>,
  ): NodeExecutionContext<TConfig> {
    const stubConfig = { getCredentialRequirements: args.getCredentialRequirements } as NodeConfigBase;
    const getCredential = this.credentialResolverFactory.create(ctx.workflowId, args.connectionNodeId, stubConfig);
    return {
      ...ctx,
      nodeId: args.connectionNodeId,
      getCredential,
    };
  }
}
