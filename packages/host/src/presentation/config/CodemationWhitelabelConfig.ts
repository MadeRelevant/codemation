/**
 * Optional host shell whitelabeling (sidebar, login, document title).
 * `logoPath` is resolved relative to the consumer project root.
 */
export interface CodemationWhitelabelConfig {
  readonly productName?: string;
  /** Relative to consumer project root, e.g. `branding/logo.svg`. */
  readonly logoPath?: string;
}
