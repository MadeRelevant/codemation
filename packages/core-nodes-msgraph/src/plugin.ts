import type { CodemationPluginContext } from "@codemation/host";
import { msGraphOAuthCredentialType } from "./credentials/msGraphOAuth";
import { OnNewMsGraphMailTriggerNode } from "./mail/onNewMailNode";

/**
 * Register all MS Graph nodes and credential types into a plugin context.
 * Called by codemation.plugin.ts and can also be used in custom host setups.
 */
export function register(ctx: CodemationPluginContext): void {
  ctx.registerCredentialType(msGraphOAuthCredentialType);
  ctx.registerNode(OnNewMsGraphMailTriggerNode);
}
