/**
 * Unit-level coverage for ListenPortConflictDescriber.
 *
 * The class has private methods (parseLsofOutput, parseSsListenOutput, readLsofOutput,
 * readSsOutput) that are exercised through describeLoopbackPort().
 * We exercise them by accessing private methods via (describer as any) to avoid
 * spawning real system processes, matching the pattern used in other CLI unit tests.
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { ListenPortConflictDescriber } from "../src/dev/ListenPortConflictDescriber";

describe("ListenPortConflictDescriber — unit paths", () => {
  it("returns null for port <= 0 (invalid)", async () => {
    const describer = new ListenPortConflictDescriber("linux");
    assert.equal(await describer.describeLoopbackPort(0), null);
    assert.equal(await describer.describeLoopbackPort(-1), null);
  });

  it("returns null for non-integer port", async () => {
    const describer = new ListenPortConflictDescriber("linux");
    assert.equal(await describer.describeLoopbackPort(3.14), null);
  });

  it("returns null on unsupported platform", async () => {
    const describer = new ListenPortConflictDescriber("win32" as NodeJS.Platform);
    assert.equal(await describer.describeLoopbackPort(8080), null);
  });

  it("parseLsofOutput extracts pid, command, and endpoint", () => {
    const describer = new ListenPortConflictDescriber("linux");
    // Typical lsof -Fpcn output
    const raw = ["p1234", "cnode", "n127.0.0.1:3000", "p5678", "cpython", "n0.0.0.0:8080", ""].join("\n");
    const result = (describer as any).parseLsofOutput(raw) as ReadonlyArray<{
      pid: number;
      command: string;
      endpoint: string;
    }>;
    assert.equal(result.length, 2);
    assert.equal(result[0].pid, 1234);
    assert.equal(result[0].command, "node");
    assert.equal(result[0].endpoint, "127.0.0.1:3000");
    assert.equal(result[1].pid, 5678);
    assert.equal(result[1].command, "python");
    assert.equal(result[1].endpoint, "0.0.0.0:8080");
  });

  it("parseLsofOutput skips lines shorter than 2 characters", () => {
    const describer = new ListenPortConflictDescriber("linux");
    const raw = ["p", "cnode", "n127.0.0.1:3000", ""].join("\n");
    // "p" alone has length 1 — should be skipped (pid stays null)
    const result = (describer as any).parseLsofOutput(raw) as ReadonlyArray<unknown>;
    // Without a valid pid, no endpoint can be pushed
    assert.equal(result.length, 0);
  });

  it("parseSsListenOutput parses realistic ss -lntp output for a given port", () => {
    const describer = new ListenPortConflictDescriber("linux");
    const port = 3000;
    // Realistic ss -lntp output line
    const raw = [
      "Netid State   Recv-Q Send-Q Local Address:Port Peer Address:Port Process",
      `tcp   LISTEN  0      128    0.0.0.0:${port}      0.0.0.0:*     users:(("node",pid=9876,fd=23))`,
      "",
    ].join("\n");
    const result = (describer as any).parseSsListenOutput(raw, port) as ReadonlyArray<{
      pid: number;
      command: string;
      endpoint: string;
    }>;
    assert.equal(result.length, 1);
    assert.equal(result[0].pid, 9876);
    assert.equal(result[0].command, "node");
    assert.equal(result[0].endpoint, `0.0.0.0:${port}`);
  });

  it("parseSsListenOutput ignores lines without LISTEN or without the port suffix", () => {
    const describer = new ListenPortConflictDescriber("linux");
    const port = 3000;
    const raw = [
      // Line with the port but no LISTEN keyword
      `tcp   ESTAB  0  0  0.0.0.0:${port}  0.0.0.0:*  users:(("node",pid=111,fd=5))`,
      // Line with LISTEN but different port
      `tcp   LISTEN 0  128  0.0.0.0:8080  0.0.0.0:*  users:(("python",pid=222,fd=3))`,
      "",
    ].join("\n");
    const result = (describer as any).parseSsListenOutput(raw, port) as ReadonlyArray<unknown>;
    assert.equal(result.length, 0);
  });

  it("parseSsListenOutput uses 'unknown' command and fallback endpoint when regex groups are absent", () => {
    const describer = new ListenPortConflictDescriber("linux");
    const port = 4000;
    // A line that has LISTEN and the port but no users:() block for command, and odd spacing
    const raw = `tcp LISTEN 0 128 LISTEN :${port} 0.0.0.0:* pid=7777`;
    const result = (describer as any).parseSsListenOutput(raw, port) as ReadonlyArray<{
      pid: number;
      command: string;
      endpoint: string;
    }>;
    assert.equal(result.length, 1);
    assert.equal(result[0].pid, 7777);
    assert.equal(result[0].command, "unknown");
    // No local address match → falls back to "tcp:<port>"
    assert.equal(result[0].endpoint, `tcp:${port}`);
  });

  it("describeLoopbackPort returns null when no occupants are found", async () => {
    const describer = new ListenPortConflictDescriber("linux");
    // Override private methods to return empty results
    (describer as any).readLsofOutput = async () => "";
    (describer as any).readSsOutput = async () => "";
    const result = await describer.describeLoopbackPort(9999);
    assert.equal(result, null);
  });

  it("describeLoopbackPort uses ss fallback when lsof returns null on linux", async () => {
    const describer = new ListenPortConflictDescriber("linux");
    // Simulate lsof unavailable (returns null) and ss returning a known line
    const port = 5555;
    (describer as any).readLsofOutput = async () => null;
    (describer as any).readSsOutput = async () =>
      `tcp LISTEN 0 128 0.0.0.0:${port} 0.0.0.0:* users:(("myapp",pid=42,fd=10))`;
    const result = await describer.describeLoopbackPort(port);
    assert.ok(result !== null, "expected ss fallback to find the occupant");
    assert.ok(result.includes("pid=42"), `expected pid in result, got: ${result}`);
    assert.ok(result.includes("command=myapp"), `expected command in result, got: ${result}`);
  });

  it("describeLoopbackPort formats output as pid=X command=Y endpoint=Z", async () => {
    const describer = new ListenPortConflictDescriber("linux");
    (describer as any).readLsofOutput = async () => ["p1111", "cmyprocess", "n127.0.0.1:7777"].join("\n");
    const result = await describer.describeLoopbackPort(7777);
    assert.ok(result !== null);
    assert.equal(result, "pid=1111 command=myprocess endpoint=127.0.0.1:7777");
  });

  it("ss fallback is skipped on darwin (only linux falls back to ss)", async () => {
    const describer = new ListenPortConflictDescriber("darwin");
    let ssReadCalled = false;
    (describer as any).readLsofOutput = async () => null;
    (describer as any).readSsOutput = async () => {
      ssReadCalled = true;
      return "";
    };
    const result = await describer.describeLoopbackPort(8888);
    assert.equal(result, null);
    assert.equal(ssReadCalled, false, "ss should not be called on darwin");
  });
});
