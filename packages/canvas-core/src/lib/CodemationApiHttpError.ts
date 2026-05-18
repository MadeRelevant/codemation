/**
 * Thrown when a Codemation `/api/*` HTTP response has a non-OK status.
 * Use {@link CodemationApiHttpError.bodyText} for user-facing or diagnostic messages.
 */
export class CodemationApiHttpError extends Error {
  readonly status: number;

  readonly bodyText: string;

  constructor(status: number, bodyText: string) {
    const trimmed = bodyText.trim();
    super(trimmed.length > 0 ? `HTTP ${status}: ${trimmed}` : `HTTP ${status}`);
    this.name = "CodemationApiHttpError";
    this.status = status;
    this.bodyText = bodyText;
  }
}
