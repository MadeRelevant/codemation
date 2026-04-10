import assert from "node:assert/strict";
import { test } from "vitest";

import { DevSessionPortsResolver } from "../src/dev/DevSessionPortsResolver";
import { LoopbackPortAllocator } from "../src/dev/LoopbackPortAllocator";
import { ListenPortResolver } from "../src/runtime/ListenPortResolver";

class StubListenPortConflictDescriber {
  constructor(private readonly conflict: string | null) {}
  async describeLoopbackPort(): Promise<string | null> {
    return this.conflict;
  }
}

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

test("DevSessionPortsResolver: framework watch mode keeps gateway on primary port and runs Next on gateway+1 when available", async () => {
  const resolver = new DevSessionPortsResolver(
    new ListenPortResolver(),
    new LoopbackPortAllocator(),
    new StubListenPortConflictDescriber(null) as never,
  );
  const ports = await resolver.resolve({
    devMode: "watch-framework",
    portEnv: undefined,
    gatewayPortEnv: undefined,
  });
  assert.equal(ports.gatewayPort, 3000);
  assert.equal(ports.nextPort, 3001);
});

test("DevSessionPortsResolver: framework watch mode falls back when gateway+1 is occupied", async () => {
  const resolver = new DevSessionPortsResolver(
    new ListenPortResolver(),
    new LoopbackPortAllocator(),
    new StubListenPortConflictDescriber("pid=1 command=busy endpoint=TCP 127.0.0.1:3001 (LISTEN)") as never,
  );
  const ports = await resolver.resolve({
    devMode: "watch-framework",
    portEnv: undefined,
    gatewayPortEnv: undefined,
  });
  assert.equal(ports.gatewayPort, 3000);
  assert.ok(Number.isInteger(ports.gatewayPort) && ports.gatewayPort > 0);
  assert.notEqual(ports.nextPort, ports.gatewayPort);
  assert.notEqual(ports.nextPort, 3001);
});
