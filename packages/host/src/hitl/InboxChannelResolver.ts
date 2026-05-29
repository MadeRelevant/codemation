import { inject, injectable } from "@codemation/core";
import type { InboxChannel, InboxChannelResolverSeam } from "@codemation/core";
import { ControlPlaneInboxChannelToken, LocalInboxChannelToken } from "@codemation/core";
import type { Logger } from "../application/logging/Logger";
import type { PairingConfig } from "../pairing/pairing.types";
import { PairingConfigToken } from "../pairing/PairingConfigToken";
import { ServerLoggerFactory } from "../infrastructure/logging/ServerLoggerFactory";

/**
 * Resolves the correct `InboxChannel` for the current deployment mode.
 *
 * - Managed mode (PairingConfig present + CP channel registered): returns CP channel.
 * - Otherwise: returns local channel.
 * - If managed mode is detected but CP channel is not registered, falls back to local
 *   and emits a warning (misconfiguration).
 */
@injectable()
export class InboxChannelResolver implements InboxChannelResolverSeam {
  private readonly logger: Logger;

  constructor(
    @inject(PairingConfigToken, { isOptional: true }) private readonly pairingConfig: PairingConfig | null,
    @inject(LocalInboxChannelToken, { isOptional: true }) private readonly local: InboxChannel | null,
    @inject(ControlPlaneInboxChannelToken, { isOptional: true }) private readonly cp: InboxChannel | null,
    @inject(ServerLoggerFactory) loggerFactory: ServerLoggerFactory,
  ) {
    this.logger = loggerFactory.create("codemation.hitl.inbox");

    if (pairingConfig && !cp) {
      this.logger.warn(
        "InboxChannelResolver: managed mode is active but no ControlPlaneInboxChannel is registered. " +
          "Falling back to local inbox channel. Register a ControlPlaneInboxChannel to resolve this.",
      );
    }
  }

  resolve(): { channel: InboxChannel; workspaceId?: string } {
    if (this.pairingConfig && this.cp) {
      return { channel: this.cp, workspaceId: this.pairingConfig.workspaceId };
    }
    if (!this.local) {
      throw new Error(
        "InboxChannelResolver: no inbox channel is registered. " +
          "Register a LocalInboxChannel or ControlPlaneInboxChannel.",
      );
    }
    return { channel: this.local };
  }
}
