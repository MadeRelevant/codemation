import { spawn, type ChildProcess } from "node:child_process";
import process from "node:process";

/**
 * Stops a spawned dev child and every descendant process.
 *
 * On Unix, children are expected to have been created with `spawn({ detached: true })` so the root
 * child is the process-group leader; we send `SIGKILL` to the whole group via `kill(-pid, 'SIGKILL')`.
 * On Windows, uses `taskkill /F /T` to terminate the process tree.
 */
export class DevTrackedProcessTreeKiller {
  async killProcessTreeRootedAt(child: ChildProcess): Promise<void> {
    const pid = child.pid;
    if (pid === undefined) {
      this.trySigKill(child);
      await this.waitForExit(child);
      return;
    }
    if (process.platform === "win32") {
      await this.killWindowsProcessTree(pid);
    } else {
      try {
        process.kill(-pid, "SIGKILL");
      } catch {
        this.trySigKill(child);
      }
    }
    await this.waitForExit(child);
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

  private waitForExit(child: ChildProcess): Promise<void> {
    if (child.exitCode !== null || child.signalCode !== null) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      child.once("exit", () => {
        resolve();
      });
    });
  }
}
