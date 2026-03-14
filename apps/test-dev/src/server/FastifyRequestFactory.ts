import type { FastifyRequest } from "fastify";

export class FastifyRequestFactory {
  create(request: FastifyRequest): Request {
    return new Request(this.resolveUrl(request), {
      method: request.method.toUpperCase(),
      headers: this.createHeaders(request),
      body: this.resolveBody(request),
    });
  }

  private resolveUrl(request: FastifyRequest): string {
    const host = request.headers.host ?? "127.0.0.1:3000";
    const protocol = request.protocol ?? "http";
    return `${protocol}://${host}${request.raw.url ?? request.url}`;
  }

  private createHeaders(request: FastifyRequest): Headers {
    const headers = new Headers();
    for (const [key, value] of Object.entries(request.headers)) {
      if (value === undefined) {
        continue;
      }
      headers.set(key, Array.isArray(value) ? value.join(", ") : value);
    }
    return headers;
  }

  private resolveBody(request: FastifyRequest): BodyInit | undefined {
    if (request.method === "GET" || request.method === "HEAD") {
      return undefined;
    }
    if (request.body === undefined || request.body === null) {
      return undefined;
    }
    if (typeof request.body === "string") {
      return request.body;
    }
    if (request.body instanceof Uint8Array) {
      const normalizedBody = new Uint8Array(request.body.byteLength);
      normalizedBody.set(request.body);
      return new Blob([normalizedBody]);
    }
    return JSON.stringify(request.body);
  }
}
