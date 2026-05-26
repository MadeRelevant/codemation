/**
 * Thrown by managed-mode providers when `setMaterial` is called. Managed
 * credential bytes are owned by the control plane; the workspace must not
 * mutate them. See `docs/design/credentials-oauth-unification.md` and
 * `planning/sprints/credentials-vault/02-controlplane-material-provider.md`.
 */
export class ManagedCredentialMaterialWriteError extends Error {
  constructor(
    message: string = "managed credentials are owned by the control plane; use the Connected apps page to create or modify them.",
  ) {
    super(message);
    this.name = "ManagedCredentialMaterialWriteError";
  }
}
