import assert from "node:assert/strict";
import { createServer } from "node:http";
import { type AddressInfo } from "node:net";
import { describe, expect, it, test } from "vitest";

import { ListenPortConflictDescriber } from "../src/dev/ListenPortConflictDescriber";

describe("ListenPortConflictDescriber - invalid inputs", () => {
  it("returns null for zero port", async () => {
    const describer = new ListenPortConflictDescriber("linux");
    expect(await describer.describeLoopbackPort(0)).toBeNull();
  });

  it("returns null for negative port", async () => {
    const describer = new ListenPortConflictDescriber("linux");
    expect(await describer.describeLoopbackPort(-1)).toBeNull();
  });

  it("returns null for non-integer port", async () => {
    const describer = new ListenPortConflictDescriber("linux");
    expect(await describer.describeLoopbackPort(3000.5)).toBeNull();
  });

  it("returns null on unsupported platform (win32)", async () => {
    const describer = new ListenPortConflictDescriber("win32");
    expect(await describer.describeLoopbackPort(3000)).toBeNull();
  });

  it("returns null on unsupported platform (freebsd)", async () => {
    const describer = new ListenPortConflictDescriber("freebsd");
    expect(await describer.describeLoopbackPort(3000)).toBeNull();
  });
});

test("ListenPortConflictDescriber describes the process listening on a loopback port", async () => {
  if (process.platform !== "linux" && process.platform !== "darwin") {
    return;
  }

  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const port = (server.address() as AddressInfo).port;

  const describer = new ListenPortConflictDescriber();
  const description = await describer.describeLoopbackPort(port);

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

  assert.ok(description !== null, "expected lsof or ss to identify the listener");
  assert.match(description, new RegExp(`pid=${process.pid}\\b`));
});
