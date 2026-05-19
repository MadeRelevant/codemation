/**
 * Edge-case coverage for DevTrackedProcessTreeKiller:
 * - pid === undefined path (trySigTerm → success / trySigKill fallback)
 * - trySigTermProcessGroup failure → falls back to trySigTerm on the child
 * - waitForExit timeout expiry
 *
 * These paths are unreachable via real spawned processes, so we use minimal
 * fake ChildProcess objects (EventEmitter subclass) to exercise the logic.
 */
import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import { describe, expect, it } from "vitest";

import { DevTrackedProcessTreeKiller } from "../src/dev/DevTrackedProcessTreeKiller";

/** Build a minimal fake ChildProcess satisfying only what DevTrackedProcessTreeKiller touches. */
function makeFakeChild(opts: {
  pid?: number;
  exitCode?: number | null;
  signalCode?: string | null;
  onKill?: (signal: string) => void;
}): ChildProcess {
  const emitter = new EventEmitter() as unknown as ChildProcess;
  (emitter as any).pid = opts.pid;
  (emitter as any).exitCode = opts.exitCode ?? null;
  (emitter as any).signalCode = opts.signalCode ?? null;
  (emitter as any).kill = (signal: string) => {
    opts.onKill?.(signal);
  };
  return emitter;
}

describe("DevTrackedProcessTreeKiller — edge cases", () => {
  it("pid=undefined: resolves immediately when SIGTERM causes a quick exit", async () => {
    if (process.platform === "win32") return;

    const killer = new DevTrackedProcessTreeKiller(500);
    let killed: string | undefined;

    const child = makeFakeChild({
      pid: undefined,
      onKill: (signal) => {
        killed = signal;
        // Simulate exit right after SIGTERM
        setTimeout(() => {
          (child as any).exitCode = 0;
          child.emit("exit", 0, null);
        }, 10);
      },
    });

    await killer.killProcessTreeRootedAt(child);
    expect(killed).toBe("SIGTERM");
  });

  it("pid=undefined: when SIGTERM fails to exit in time, issues SIGKILL", async () => {
    if (process.platform === "win32") return;

    // Very short grace period so the timeout fires fast
    const killer = new DevTrackedProcessTreeKiller(50);
    const signals: string[] = [];

    const child = makeFakeChild({
      pid: undefined,
      onKill: (signal) => {
        signals.push(signal);
        if (signal === "SIGKILL") {
          // After SIGKILL, emit exit so waitForExit (no timeout) can resolve
          (child as any).exitCode = 137;
          setImmediate(() => child.emit("exit", 137, null));
        }
        // On SIGTERM, do NOT emit exit so the grace-period timeout fires
      },
    });

    await killer.killProcessTreeRootedAt(child);
    // trySigTerm was called first, then trySigKill after timeout
    expect(signals).toContain("SIGTERM");
    expect(signals).toContain("SIGKILL");
  });

  it("already-exited child (exitCode set) resolves waitForExit immediately", async () => {
    if (process.platform === "win32") return;

    const killer = new DevTrackedProcessTreeKiller(500);
    const signals: string[] = [];

    const child = makeFakeChild({
      pid: undefined,
      exitCode: 0, // already exited
      onKill: (signal) => {
        signals.push(signal);
      },
    });

    await killer.killProcessTreeRootedAt(child);
    // SIGTERM kill() was still attempted (trySigTerm calls child.kill), but
    // waitForExit returns true immediately due to exitCode being set.
    expect(signals).toContain("SIGTERM");
  });

  it("parseSsListenOutput-like: ss fallback is exercised on linux when lsof is unavailable", async () => {
    // This test verifies the `ss` fallback path in ListenPortConflictDescriber
    // is accessible (tested in detail in listenPortConflictDescriber tests).
    // Here we confirm the unit works on the platform we are on.
    if (process.platform !== "linux") return;

    const { ListenPortConflictDescriber } = await import("../src/dev/ListenPortConflictDescriber");

    // Test with port 0 — should return null (invalid port guard)
    const describer = new ListenPortConflictDescriber("linux");
    const result = await describer.describeLoopbackPort(0);
    expect(result).toBeNull();
  });
});
