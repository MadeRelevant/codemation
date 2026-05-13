import { inject, injectable } from "@codemation/core";
import { PairedFetch } from "../pairing/PairedFetch";
import type { PairingConfig } from "../pairing/pairing.types";
import { PairingConfigToken } from "../pairing/PairingConfigToken";
import { BrokerRefreshInvalidGrantError } from "./BrokerRefreshInvalidGrantError";
import { BrokerRefreshError } from "./BrokerRefreshError";

export type BrokerRefreshResult = Readonly<{
  accessToken: string;
  expiresAt: number;
  scopesGranted: ReadonlyArray<string>;
  refreshToken?: string;
}>;

export { BrokerRefreshInvalidGrantError, BrokerRefreshError };

/**
 * Calls the control-plane broker's credential refresh endpoint via a HMAC-signed
 * PairedFetch request. The broker performs the actual provider token exchange,
 * keeping client_secret out of the installation.
 *
 * Endpoint: POST {controlPlaneUrl}/internal/credentials/refresh
 */
@injectable()
export class BrokerClient {
  constructor(
    @inject(PairedFetch) private readonly pairedFetch: PairedFetch,
    @inject(PairingConfigToken) private readonly pairingConfig: PairingConfig,
  ) {}

  async refreshCredential(
    args: Readonly<{ credentialInstanceId: string; refreshToken: string }>,
  ): Promise<BrokerRefreshResult> {
    const url = `${this.pairingConfig.controlPlaneUrl}/internal/credentials/refresh`;
    const response = await this.pairedFetch.post(url, {
      credentialInstanceId: args.credentialInstanceId,
      refreshToken: args.refreshToken,
    });

    if (response.status === 410) {
      throw new BrokerRefreshInvalidGrantError(args.credentialInstanceId);
    }
    if (!response.ok) {
      throw new BrokerRefreshError(args.credentialInstanceId, response.status);
    }

    return (await response.json()) as BrokerRefreshResult;
  }
}
