import { spawn, type ChildProcess } from "node:child_process";
import process from "node:process";

/**
 * Stops a spawned dev child and every descendant process.
 *
 * On Unix, children are expected to have been created with `spawn({ detached: true })` so the root
 * child is the process-group leader; we first send `SIGTERM` to the whole group and only escalate to
 * `SIGKILL` when the process does not exit within the grace period.
 * On Windows, uses `taskkill /F /T` to terminate the process tree.
 */
export class DevTrackedProcessTreeKiller {
  constructor(private readonly terminationGracePeriodMs = 1500) {}

  async killProcessTreeRootedAt(child: ChildProcess): Promise<void> {
    const pid = child.pid;
    if (pid === undefined) {
      if (!(await this.trySigTerm(child))) {
        this.trySigKill(child);
        await this.waitForExit(child);
      }
      return;
    }
    if (process.platform === "win32") {
      await this.killWindowsProcessTree(pid);
      await this.waitForExit(child);
    } else {
      if (!(await this.trySigTermProcessGroup(pid, child))) {
        this.trySigKill(child);
        this.trySigKillProcessGroup(pid);
        await this.waitForExit(child);
      }
    }
  }

  private trySigKill(child: ChildProcess): void {
    try {
      child.kill("SIGKILL");
    } catch {
      // Process may already be gone.
    }
  }

  private killWindowsProcessTree(pid: number): Promise<void> {
    return new Promise((resolve) => {
      const proc = spawn("taskkill", ["/F", "/T", "/PID", String(pid)], {
        stdio: "ignore",
        windowsHide: true,
      });
      proc.once("exit", () => {
        resolve();
      });
      proc.once("error", () => {
        resolve();
      });
    });
  }

  private async trySigTerm(child: ChildProcess): Promise<boolean> {
    try {
      child.kill("SIGTERM");
    } catch {
      return child.exitCode !== null || child.signalCode !== null;
    }
    return await this.waitForExit(child, this.terminationGracePeriodMs);
  }

  private async trySigTermProcessGroup(pid: number, child: ChildProcess): Promise<boolean> {
    try {
      process.kill(-pid, "SIGTERM");
    } catch {
      return await this.trySigTerm(child);
    }
    return await this.waitForExit(child, this.terminationGracePeriodMs);
  }

  private trySigKillProcessGroup(pid: number): void {
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      // Process group may already be gone.
    }
  }

  private waitForExit(child: ChildProcess, timeoutMs?: number): Promise<boolean> {
    if (child.exitCode !== null || child.signalCode !== null) {
      return Promise.resolve(true);
    }
    return new Promise<boolean>((resolve) => {
      let timeout: NodeJS.Timeout | undefined;
      const onExit = () => {
        if (timeout) {
          clearTimeout(timeout);
        }
        resolve(true);
      };
      child.once("exit", onExit);
      if (timeoutMs === undefined) {
        return;
      }
      timeout = setTimeout(() => {
        child.removeListener("exit", onExit);
        resolve(child.exitCode !== null || child.signalCode !== null);
      }, timeoutMs);
    });
  }
}
