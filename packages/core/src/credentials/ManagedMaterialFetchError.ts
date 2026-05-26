/**
 * Thrown by `ControlPlaneCredentialMaterialProvider` when the control-plane
 * material endpoint returns a non-2xx response or a malformed body. Exposes
 * the HTTP status and the raw error body so call sites can surface actionable
 * detail without parsing strings.
 */
export class ManagedMaterialFetchError extends Error {
  constructor(
    public readonly status: number,
    public readonly providerErrorBody: string,
    message?: string,
  ) {
    super(message ?? `Control-plane material fetch failed: HTTP ${status} ${providerErrorBody}`);
    this.name = "ManagedMaterialFetchError";
  }
}
