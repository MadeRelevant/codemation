import { ApplicationRequestError } from "../../application/ApplicationRequestError";

export class ServerHttpErrorResponseFactory {
  static fromUnknown(error: unknown): Response {
    if (error instanceof ApplicationRequestError) {
      return Response.json(error.payload, { status: error.status });
    }
    this.logUnexpectedError(error);
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: message }, { status: 500 });
  }

  private static logUnexpectedError(error: unknown): void {
    if (error instanceof Error) {
      const stack = error.stack ?? `${error.name}: ${error.message}`;
      const causeText = this.formatCause(error);
      console.error(`[codemation-http] unhandled route error\n${stack}${causeText}`);
      return;
    }
    console.error(`[codemation-http] unhandled route error\n${String(error)}`);
  }

  private static formatCause(error: Error): string {
    if (!(error instanceof Error) || !("cause" in error) || !error.cause) {
      return "";
    }
    const cause = error.cause;
    if (cause instanceof Error) {
      return `\nCaused by:\n${cause.stack ?? `${cause.name}: ${cause.message}`}`;
    }
    return `\nCaused by:\n${String(cause)}`;
  }
}
