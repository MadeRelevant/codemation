import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import { afterEach, test } from "vitest";

import { DevHttpProbe } from "../src/dev/DevHttpProbe";

let activeServer: Server | null = null;

afterEach(async () => {
  if (!activeServer) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    activeServer?.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
  activeServer = null;
});

test("waitUntilUrlRespondsOk treats redirect responses as healthy", async () => {
  activeServer = createServer((_request, response) => {
    response.writeHead(302, {
      location: "http://127.0.0.1:9/login",
    });
    response.end();
  });
  await new Promise<void>((resolve) => {
    activeServer?.listen(0, "127.0.0.1", () => resolve());
  });
  const address = activeServer.address();
  assert.ok(address && typeof address === "object");
  const probe = new DevHttpProbe();

  await probe.waitUntilUrlRespondsOk(`http://127.0.0.1:${(address as AddressInfo).port}/`);
});
