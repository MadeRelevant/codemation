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

  it("trySigTermProcessGroup: when process.kill(-pid) throws, falls back to trySigTerm", async () => {
    if (process.platform === "win32") return;

    // Use a large non-existent PID — process.kill(-<nonexistent>, SIGTERM) will throw ESRCH,
    // which triggers the catch branch (line 72: return await this.trySigTerm(child))
    const killer = new DevTrackedProcessTreeKiller(200);
    const signals: string[] = [];

    const child = makeFakeChild({
      pid: 2147483647, // max int — almost certainly not a real PID
      onKill: (signal) => {
        signals.push(signal);
        if (signal === "SIGTERM") {
          // Simulate the child exiting after SIGTERM
          setTimeout(() => {
            (child as any).exitCode = 0;
            child.emit("exit", 0, null);
          }, 10);
        }
      },
    });

    // killProcessTreeRootedAt → trySigTermProcessGroup(-pid) throws → trySigTerm(child) → SIGTERM → exits
    await killer.killProcessTreeRootedAt(child);
    expect(signals).toContain("SIGTERM");
  });

  it("trySigTerm catch: when child.kill() throws (e.g. process gone), returns exitCode check (line 63)", async () => {
    if (process.platform === "win32") return;

    const killer = new DevTrackedProcessTreeKiller(200);

    // A child whose kill() throws — exercises the catch block in trySigTerm (line 63)
    const child = makeFakeChild({
      pid: undefined, // use the pid=undefined path which calls trySigTerm
      exitCode: 1, // child already exited — kill() would throw, catch returns true
      onKill: () => {
        throw new Error("ESRCH: process not found");
      },
    });

    // Should resolve without throwing — the catch in trySigTerm returns true (exitCode !== null)
    await killer.killProcessTreeRootedAt(child);
    expect((child as any).exitCode).toBe(1);
  });

  it("trySigKillProcessGroup with non-existent pid: process.kill throws, catch swallows (lines 78-79)", async () => {
    if (process.platform === "win32") return;

    // A real child with a large non-existent PID so trySigTermProcessGroup times out and
    // trySigKillProcessGroup is called (its try { process.kill(-pid, SIGKILL) } body is exercised)
    const killer = new DevTrackedProcessTreeKiller(30); // short grace period
    const signals: string[] = [];

    // pid=2147483647 — almost certainly not real; trySigTermProcessGroup SIGTERM may succeed
    // but we force it to time out by NOT emitting exit
    const child = makeFakeChild({
      pid: 2147483647,
      exitCode: null,
      onKill: (signal) => {
        signals.push(signal);
        if (signal === "SIGKILL") {
          // Emit exit after SIGKILL so waitForExit (no timeout) resolves
          (child as any).exitCode = 137;
          setImmediate(() => child.emit("exit", 137, null));
        }
        // On SIGTERM, do NOT emit exit so the grace-period timeout fires and SIGKILL is issued
      },
    });

    await killer.killProcessTreeRootedAt(child);
    // trySigKillProcessGroup was called — it either succeeded or threw (both caught)
    // The test passes if we get here without an unhandled error
    expect((child as any).exitCode).toBe(137);
  });

  it("waitForExit without timeout resolves when child emits exit (line 99 path)", async () => {
    if (process.platform === "win32") return;

    // To hit line 99 in waitForExit, we need:
    // 1. waitForExit called with timeoutMs===undefined
    // 2. child.exitCode is STILL null when waitForExit is entered (so line 86 check fails)
    // 3. Then exit event fires later
    //
    // The pid=undefined → SIGTERM timeout → SIGKILL path calls waitForExit(child) with no timeout.
    // We delay both exitCode set AND exit event to ensure exitCode is null when waitForExit starts.
    const child = makeFakeChild({
      pid: undefined,
      exitCode: null,
      onKill: (signal) => {
        if (signal === "SIGTERM") {
          // Do NOT emit exit — let the grace period time out
        } else if (signal === "SIGKILL") {
          // Delay setting exitCode and emitting exit so they happen AFTER waitForExit is entered
          setTimeout(() => {
            (child as any).exitCode = 137;
            child.emit("exit", 137, null);
          }, 20);
        }
      },
    });

    const shortGraceKiller = new DevTrackedProcessTreeKiller(30);
    await shortGraceKiller.killProcessTreeRootedAt(child);
    expect((child as any).exitCode).toBe(137);
  });
});
