import { spawn } from "node:child_process";

import { describe, expect, it } from "vitest";

import { DevTrackedProcessTreeKiller } from "../src/dev/DevTrackedProcessTreeKiller";

describe("DevTrackedProcessTreeKiller", () => {
  const killer = new DevTrackedProcessTreeKiller();

  it("terminates a detached child and its process group on Unix", async () => {
    if (process.platform === "win32") {
      return;
    }
    const child = spawn(process.execPath, ["-e", "setInterval(()=>{}, 1e9)"], {
      detached: true,
      stdio: "ignore",
    });
    const pid = child.pid;
    if (pid === undefined) {
      throw new Error("Expected child pid");
    }
    await new Promise<void>((resolve) => {
      setImmediate(() => {
        resolve();
      });
    });
    await killer.killProcessTreeRootedAt(child);
    await new Promise<void>((resolve) => {
      setTimeout(() => {
        resolve();
      }, 200);
    });
    expect(() => process.kill(pid, 0)).toThrow();
  });

  it("terminates a detached child process tree on Windows", async () => {
    if (process.platform !== "win32") {
      return;
    }
    const child = spawn(process.execPath, ["-e", "setInterval(()=>{}, 1e9)"], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    const pid = child.pid;
    if (pid === undefined) {
      throw new Error("Expected child pid");
    }
    await new Promise<void>((resolve) => {
      setImmediate(() => {
        resolve();
      });
    });
    await killer.killProcessTreeRootedAt(child);
    await new Promise<void>((resolve) => {
      setTimeout(() => {
        resolve();
      }, 400);
    });
    expect(() => process.kill(pid, 0)).toThrow();
  });
});
