import { createServer, type Server } from "node:http";
import type { Logger } from "../../application/logging/Logger";
import type { CodemationHonoApiApp } from "./hono/CodemationHonoApiAppFactory";

/**
 * Creates a Node.js http.Server that bridges IncomingMessage to Hono's Fetch API.
 * Used by {@link import("../../bootstrap/runtime/HeadlessApiRuntime").HeadlessApiRuntime}
 * to serve the Hono API without Next.js.
 */
export class HeadlessHttpServerFactory {
  create(honoApp: CodemationHonoApiApp, port: number, logger: Logger): Server {
    return createServer((req, res) => {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? `127.0.0.1:${port}`}`);
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (value === undefined) continue;
        if (Array.isArray(value)) {
          for (const v of value) headers.append(key, v);
        } else {
          headers.set(key, value);
        }
      }
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        // eslint-disable-next-line codemation/no-buffer-everything -- node:http bridge; no streaming alternative when adapting IncomingMessage to Fetch API Request
        const body = chunks.length > 0 ? Buffer.concat(chunks) : null;
        const fetchRequest = new Request(url, {
          method: req.method ?? "GET",
          headers,
          body: body?.byteLength ? body : undefined,
          // @ts-expect-error — Node's Request needs duplex for streaming; required in some runtimes
          duplex: "half",
        });
        Promise.resolve(honoApp.fetch(fetchRequest))
          .then(async (fetchResponse: Response) => {
            const responseHeaders: Record<string, string> = {};
            fetchResponse.headers.forEach((value, key) => {
              responseHeaders[key] = value;
            });
            res.writeHead(fetchResponse.status, responseHeaders);
            // eslint-disable-next-line codemation/no-buffer-everything -- node:http bridge; Hono Fetch Response must be fully buffered to write to ServerResponse
            const responseBody = await fetchResponse.arrayBuffer();
            res.end(Buffer.from(responseBody));
          })
          .catch((err: unknown) => {
            logger.error("Unhandled request error", err instanceof Error ? err : new Error(String(err)));
            if (!res.headersSent) {
              res.writeHead(500);
              res.end("Internal server error");
            }
          });
      });
    });
  }
}
