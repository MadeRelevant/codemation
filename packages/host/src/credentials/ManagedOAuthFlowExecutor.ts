import { inject, injectable } from "@codemation/core";
import type {
  OAuthFlowCallbackArgs,
  OAuthFlowExecutor,
  OAuthFlowStartArgs,
  OAuthFlowStartResult,
  OAuthMaterial,
} from "@codemation/core";
import type { LoggerFactory } from "../application/logging/Logger";

import { ApplicationTokens } from "../applicationTokens";
import { PairedFetch } from "../pairing/PairedFetch";
import { PairingConfigToken } from "../pairing/PairingConfigToken";
import type { PairingConfig } from "../pairing/pairing.types";
import { ManagedOAuthRefreshInvalidGrantError } from "./ManagedOAuthRefreshInvalidGrantError";

/**
 * OAuthFlowExecutor for managed mode (paired with a control plane).
 *
 * Delegates the entire OAuth dance to the control plane over HMAC-signed calls.
 * Client secrets never leave the control plane.
 */
@injectable()
export class ManagedOAuthFlowExecutor implements OAuthFlowExecutor {
  constructor(
    @inject(PairedFetch) private readonly pairedFetch: PairedFetch,
    @inject(PairingConfigToken) private readonly pairingConfig: PairingConfig,
    @inject(ApplicationTokens.LoggerFactory) private readonly loggers: LoggerFactory,
  ) {}

  async start(args: OAuthFlowStartArgs): Promise<OAuthFlowStartResult> {
    const logger = this.loggers.create("codemation.credentials.managed-oauth");
    const url = `${this.pairingConfig.controlPlaneUrl}/internal/oauth/start`;
    const response = await this.pairedFetch.post(url, {
      typeId: args.typeId,
      scopes: args.scopes,
      redirectUri: args.redirectUri,
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      const excerpt = body.slice(0, 200);
      logger.warn(`ManagedOAuthFlowExecutor.start failed: ${response.status} ${excerpt}`);
      throw new Error(`ManagedOAuthFlowExecutor.start failed: ${response.status} ${excerpt}`);
    }
    const json = (await response.json()) as { consentUrl: string; stateToken: string };
    return { consentUrl: json.consentUrl, stateToken: json.stateToken };
  }

  lookupInstanceId(_stateToken: string): string | undefined {
    // Managed mode — state is owned by the control plane, not the host.
    return undefined;
  }

  async completeCallback(args: OAuthFlowCallbackArgs): Promise<OAuthMaterial> {
    const logger = this.loggers.create("codemation.credentials.managed-oauth");
    const url = `${this.pairingConfig.controlPlaneUrl}/internal/oauth/complete`;
    const response = await this.pairedFetch.post(url, {
      stateToken: args.stateToken,
      code: args.code,
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      const excerpt = body.slice(0, 200);
      logger.warn(`ManagedOAuthFlowExecutor.completeCallback failed: ${response.status} ${excerpt}`);
      throw new Error(`ManagedOAuthFlowExecutor.completeCallback failed: ${response.status} ${excerpt}`);
    }
    return (await response.json()) as OAuthMaterial;
  }

  async refresh(args: { typeId: string; instanceId: string; material: OAuthMaterial }): Promise<OAuthMaterial> {
    const { typeId, instanceId, material } = args;
    if (!material.refreshToken) {
      throw new Error("ManagedOAuthFlowExecutor.refresh: no refresh token available");
    }
    const url = `${this.pairingConfig.controlPlaneUrl}/internal/oauth/refresh`;
    const response = await this.pairedFetch.post(url, {
      typeId,
      instanceId,
      refreshToken: material.refreshToken,
    });
    if (response.status === 410) {
      throw new ManagedOAuthRefreshInvalidGrantError(instanceId);
    }
    if (!response.ok) {
      throw new Error(`ManagedOAuthFlowExecutor.refresh failed: ${response.status}`);
    }
    const refreshed = (await response.json()) as OAuthMaterial;
    // Preserve the existing refresh token if the control plane omits it from the response.
    if (!refreshed.refreshToken) {
      return { ...refreshed, refreshToken: material.refreshToken };
    }
    return refreshed;
  }
}
