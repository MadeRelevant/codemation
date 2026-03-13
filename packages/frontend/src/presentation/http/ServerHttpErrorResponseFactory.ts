import { ApplicationRequestError } from "../../application/ApplicationRequestError";

export class ServerHttpErrorResponseFactory {
  static fromUnknown(error: unknown): Response {
    if (error instanceof ApplicationRequestError) {
      return Response.json(error.payload, { status: error.status });
    }
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: message }, { status: 500 });
  }
}
