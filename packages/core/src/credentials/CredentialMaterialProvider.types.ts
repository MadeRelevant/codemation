import type { OAuthMaterial } from "./OAuthFlowExecutor.types";

/**
 * Material provider seam — see `docs/design/credentials-oauth-unification.md`,
 * "Material provider seam" section. Sits beside the workspace's
 * `CredentialStore`; persistence of the row stays at the store, persistence of
 * the bytes goes through this provider so they can live at the control plane
 * in managed mode.
 */

/**
 * Pointer to material bytes. For local rows `ref` is the workspace instance id
 * and the bytes co-locate with the row (existing `CredentialOAuth2Material` /
 * `CredentialSecretMaterial` tables). For control-plane rows `ref` is the
 * CP-side credential id; the workspace stores only the pointer.
 */
export type CredentialMaterialRef = Readonly<{
  source: "local" | "control-plane";
  id: string;
}>;

/**
 * Decrypted material bytes returned by a provider. Shape matches
 * `OAuthMaterial` — every supported credential type today is OAuth-shaped.
 */
export type MaterialBundle = OAuthMaterial;

/**
 * Caller context recorded by the CP material endpoint per fetch (D5 in the
 * `credentials-vault` sprint README). The local provider accepts but ignores
 * it; standalone mode has no audit log.
 */
export type CallerContext = Readonly<{
  workspaceId: string;
  caller:
    | Readonly<{ kind: "workflow-node"; workflowId: string; nodeId: string }>
    | Readonly<{ kind: "concierge"; chatId: string }>
    | Readonly<{ kind: "research-agent"; chatId: string }>
    | Readonly<{ kind: "manual"; userId: string }>;
  reason?: string;
}>;

export interface CredentialMaterialProvider {
  getMaterial(ref: CredentialMaterialRef, context: CallerContext): Promise<MaterialBundle>;
  setMaterial(ref: CredentialMaterialRef, material: MaterialBundle): Promise<void>;
}

/**
 * Thrown by a provider when asked to operate on a `ref.source` it does not
 * handle (e.g. the local provider being asked to read `control-plane` bytes).
 * Exported so `instanceof`-checks work across the workspace boundary.
 */
export class IllegalMaterialSourceError extends Error {
  constructor(
    public readonly source: CredentialMaterialRef["source"],
    public readonly providerName: string,
  ) {
    super(`Provider "${providerName}" cannot handle material source "${source}".`);
    this.name = "IllegalMaterialSourceError";
  }
}
