import assert from "node:assert/strict";
import { test } from "vitest";

import { DevSessionPortsResolver } from "../src/dev/DevSessionPortsResolver";
import { LoopbackPortAllocator } from "../src/dev/LoopbackPortAllocator";
import { ListenPortResolver } from "../src/runtime/ListenPortResolver";

test("ListenPortResolver resolves websocket port from explicit env or next+1", () => {
  const listen = new ListenPortResolver();
  assert.equal(listen.resolvePrimaryApplicationPort(undefined), 3000);
  assert.equal(
    listen.resolveWebsocketPortRelativeToHttp({
      nextPort: 3000,
      publicWebsocketPort: "9000",
      websocketPort: undefined,
    }),
    9000,
  );
  assert.equal(
    listen.resolveWebsocketPortRelativeToHttp({
      nextPort: 3000,
      publicWebsocketPort: undefined,
      websocketPort: undefined,
    }),
    3001,
  );
});

test("DevSessionPortsResolver: packaged UI mode ties gateway port to HTTP port when gateway env unset", async () => {
  const resolver = new DevSessionPortsResolver(new ListenPortResolver(), new LoopbackPortAllocator());
  const ports = await resolver.resolve({
    devMode: "packaged-ui",
    portEnv: "4000",
    gatewayPortEnv: undefined,
  });
  assert.equal(ports.nextPort, 4000);
  assert.equal(ports.gatewayPort, 4000);
});

test("DevSessionPortsResolver: framework watch mode uses free loopback port for gateway when gateway env unset", async () => {
  const resolver = new DevSessionPortsResolver(new ListenPortResolver(), new LoopbackPortAllocator());
  const ports = await resolver.resolve({
    devMode: "watch-framework",
    portEnv: undefined,
    gatewayPortEnv: undefined,
  });
  assert.equal(ports.nextPort, 3000);
  assert.ok(Number.isInteger(ports.gatewayPort) && ports.gatewayPort > 0);
  assert.notEqual(ports.gatewayPort, ports.nextPort);
});
