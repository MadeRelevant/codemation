import { ApplicationRequestError } from "../../application/ApplicationRequestError";

/**
 * Shape of the JSON body returned on an unhandled 500. The canvas (and any other client)
 * reads `message` + optional `stack` + optional `cause` to surface a copy/pastable error
 * dialog. Generic "Internal server error" with no detail makes operator triage impossible
 * — this contract preserves the diagnostic information the CLI logs anyway.
 */
export type ServerHttpUnhandledErrorPayload = Readonly<{
  error: "Internal server error";
  message: string;
  name?: string;
  stack?: string;
  cause?: string;
}>;

export class ServerHttpErrorResponseFactory {
  static fromUnknown(error: unknown): Response {
    if (error instanceof ApplicationRequestError) {
      return Response.json(error.payload, { status: error.status });
    }
    this.logUnexpectedError(error);
    return Response.json(this.toUnhandledPayload(error), { status: 500 });
  }

  private static toUnhandledPayload(error: unknown): ServerHttpUnhandledErrorPayload {
    if (error instanceof Error) {
      return {
        error: "Internal server error",
        message: error.message || `${error.name}: <no message>`,
        name: error.name,
        stack: error.stack,
        cause: this.formatCauseValue(error),
      };
    }
    return { error: "Internal server error", message: String(error) };
  }

  private static formatCauseValue(error: Error): string | undefined {
    if (!("cause" in error) || !error.cause) {
      return undefined;
    }
    const cause = error.cause;
    if (cause instanceof Error) {
      return cause.stack ?? `${cause.name}: ${cause.message}`;
    }
    return String(cause);
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
