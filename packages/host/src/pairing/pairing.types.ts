export interface PairingConfig {
  /** The workspace's database ID. */
  readonly workspaceId: string;
  /** Base64-encoded 32-byte raw secret shared with the control plane. */
  readonly pairingSecret: string;
  /** Base URL of the control plane API, e.g. https://api.codemation.io */
  readonly controlPlaneUrl: string;
}

export type PairingVerificationFailure = {
  readonly failure: "missing" | "version" | "expired" | "workspace" | "signature" | "replay";
};

export type PairingVerificationSuccess = {
  readonly workspaceId: string;
};

export type PairingVerificationResult = PairingVerificationSuccess | PairingVerificationFailure;
