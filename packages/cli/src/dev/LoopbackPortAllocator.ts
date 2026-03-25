import { createServer } from "node:net";

export class LoopbackPortAllocator {
  async allocate(): Promise<number> {
    return await new Promise<number>((resolve, reject) => {
      const server = createServer();
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        server.close(() => {
          if (address && typeof address === "object") {
            resolve(address.port);
            return;
          }
          reject(new Error("Failed to resolve a free TCP port."));
        });
      });
    });
  }
}
