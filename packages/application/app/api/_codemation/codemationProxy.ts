class CodemationServerUrlResolver {
  resolve(): string {
    const resolved = process.env.CODEMATION_SERVER_URL ?? process.env.NEXT_PUBLIC_CODEMATION_SERVER_URL;
    if (!resolved) throw new Error("Missing CODEMATION_SERVER_URL for frontend proxy routes");
    return resolved.endsWith("/") ? resolved.slice(0, -1) : resolved;
  }
}

class CodemationProxyRequestBuilder {
  async buildInit(request: Request): Promise<RequestInit> {
    const method = request.method.toUpperCase();
    const headers = new Headers(request.headers);
    headers.delete("host");
    if (method === "GET" || method === "HEAD") {
      return { method, headers, cache: "no-store" };
    }

    return {
      method,
      headers,
      body: await request.arrayBuffer(),
      cache: "no-store",
    };
  }
}

class CodemationProxyResponseBuilder {
  async build(response: Response): Promise<Response> {
    const headers = new Headers(response.headers);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
}

export class CodemationProxyClient {
  private readonly serverUrlResolver = new CodemationServerUrlResolver();
  private readonly requestBuilder = new CodemationProxyRequestBuilder();
  private readonly responseBuilder = new CodemationProxyResponseBuilder();

  async forward(request: Request, targetPath: string): Promise<Response> {
    const serverUrl = this.serverUrlResolver.resolve();
    const targetUrl = `${serverUrl}${targetPath}`;
    const upstreamResponse = await fetch(targetUrl, await this.requestBuilder.buildInit(request));
    return await this.responseBuilder.build(upstreamResponse);
  }
}

export const codemationProxyClient = new CodemationProxyClient();
