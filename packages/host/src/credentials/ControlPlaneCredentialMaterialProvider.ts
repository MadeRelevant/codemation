import { inject, injectable } from "@codemation/core";
import type {
  CallerContext,
  CredentialMaterialProvider,
  CredentialMaterialRef,
  MaterialBundle,
} from "@codemation/core";
import {
  IllegalMaterialSourceError,
  ManagedCredentialMaterialWriteError,
  ManagedMaterialFetchError,
} from "@codemation/core";

import { PairedFetch } from "../pairing/PairedFetch";
import { PairingConfigToken } from "../pairing/PairingConfigToken";
import type { PairingConfig } from "../pairing/pairing.types";

/**
 * Control-plane (managed-mode) implementation of `CredentialMaterialProvider`.
 *
 * `getMaterial({ source: "control-plane", id }, callerContext)` HMAC-POSTs to
 *   `<CP>/internal/credentials/material/:id`
 * with body `{ callerContext }`. The CP endpoint refreshes upstream tokens as
 * needed and returns `{ accessToken, expiresAt, scopes, providerAccountId, typeId }`.
 * The refresh token never crosses this boundary.
 *
 * `getMaterial` for `source: "local"` throws `IllegalMaterialSourceError`; a
 * dispatcher (`CompositeCredentialMaterialProvider`) routes by source.
 *
 * `setMaterial` always throws `ManagedCredentialMaterialWriteError` — managed
 * credential bytes are owned by the control plane.
 *
 * See `docs/design/credentials-oauth-unification.md` and
 * `planning/sprints/credentials-vault/02-controlplane-material-provider.md`.
 */
@injectable()
export class ControlPlaneCredentialMaterialProvider implements CredentialMaterialProvider {
  constructor(
    @inject(PairedFetch) private readonly pairedFetch: PairedFetch,
    @inject(PairingConfigToken) private readonly pairingConfig: PairingConfig,
  ) {}

  async getMaterial(ref: CredentialMaterialRef, context: CallerContext): Promise<MaterialBundle> {
    if (ref.source !== "control-plane") {
      throw new IllegalMaterialSourceError(ref.source, "ControlPlaneCredentialMaterialProvider");
    }
    const url = `${this.pairingConfig.controlPlaneUrl}/internal/credentials/material/${encodeURIComponent(ref.id)}`;
    const response = await this.pairedFetch.post(url, { callerContext: context });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new ManagedMaterialFetchError(response.status, body.slice(0, 500));
    }
    const json = (await response.json()) as {
      accessToken?: unknown;
      expiresAt?: unknown;
      scopes?: unknown;
      providerAccountId?: unknown;
      typeId?: unknown;
    };
    if (typeof json.accessToken !== "string" || json.accessToken.length === 0) {
      throw new ManagedMaterialFetchError(
        response.status,
        "missing accessToken in CP response",
        "Control-plane material response missing accessToken",
      );
    }
    return {
      accessToken: json.accessToken,
      // CP intentionally never returns the refresh token to the workspace.
      refreshToken: undefined,
      expiresAt: typeof json.expiresAt === "string" ? json.expiresAt : undefined,
      grantedScopes: Array.isArray(json.scopes) ? json.scopes.filter((s): s is string => typeof s === "string") : [],
    };
  }

  async setMaterial(_ref: CredentialMaterialRef, _material: MaterialBundle): Promise<void> {
    throw new ManagedCredentialMaterialWriteError();
  }
}
