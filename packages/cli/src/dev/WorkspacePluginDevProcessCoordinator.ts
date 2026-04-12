import { spawn, type ChildProcess } from "node:child_process";
import { access } from "node:fs/promises";
import process from "node:process";

import { DevTrackedProcessTreeKiller } from "./DevTrackedProcessTreeKiller";
import type { WorkspacePluginPackage } from "./WorkspacePluginPackageResolver";

export class WorkspacePluginDevProcessCoordinator {
  constructor(
    private readonly processTreeKiller: DevTrackedProcessTreeKiller,
    private readonly startupTimeoutMs = 30000,
    private readonly pollIntervalMs = 100,
  ) {}

  async start(
    args: Readonly<{
      env: NodeJS.ProcessEnv;
      packages: ReadonlyArray<WorkspacePluginPackage>;
      repoRoot: string;
      onUnexpectedExit: (error: Error) => void;
    }>,
  ): Promise<ReadonlyArray<ChildProcess>> {
    const startedProcesses: ChildProcess[] = [];
    try {
      for (const workspacePluginPackage of args.packages) {
        const child = this.spawnPackageDevProcess(
          workspacePluginPackage,
          args.repoRoot,
          args.env,
          args.onUnexpectedExit,
        );
        startedProcesses.push(child);
        await this.waitForPluginEntry(workspacePluginPackage, child);
      }
      return startedProcesses;
    } catch (error) {
      await Promise.all(
        startedProcesses.map((child) => this.processTreeKiller.killProcessTreeRootedAt(child).catch(() => null)),
      );
      throw error;
    }
  }

  private spawnPackageDevProcess(
    workspacePluginPackage: WorkspacePluginPackage,
    repoRoot: string,
    env: NodeJS.ProcessEnv,
    onUnexpectedExit: (error: Error) => void,
  ): ChildProcess {
    const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
    const child = spawn(pnpmCommand, ["--filter", workspacePluginPackage.packageName, "dev"], {
      cwd: repoRoot,
      detached: process.platform !== "win32",
      env,
      stdio: ["ignore", "inherit", "inherit"],
      ...(process.platform === "win32" ? { windowsHide: true } : {}),
    });
    child.on("error", (error) => {
      onUnexpectedExit(this.createUnexpectedExitError(workspacePluginPackage.packageName, error));
    });
    child.on("exit", (code, signal) => {
      if (child.killed || code === 0 || signal === "SIGTERM" || signal === "SIGKILL") {
        return;
      }
      const reason = signal ? `signal ${signal}` : `code ${code ?? 0}`;
      onUnexpectedExit(
        new Error(
          `Plugin build watcher for "${workspacePluginPackage.packageName}" exited unexpectedly with ${reason}.`,
        ),
      );
    });
    return child;
  }

  private async waitForPluginEntry(workspacePluginPackage: WorkspacePluginPackage, child: ChildProcess): Promise<void> {
    const deadline = Date.now() + this.startupTimeoutMs;
    while (Date.now() < deadline) {
      if (await this.exists(workspacePluginPackage.pluginEntryPath)) {
        return;
      }
      if (child.exitCode !== null || child.signalCode !== null) {
        throw new Error(
          `Plugin build watcher for "${workspacePluginPackage.packageName}" exited before producing ${workspacePluginPackage.pluginEntryPath}.`,
        );
      }
      await this.sleep(this.pollIntervalMs);
    }
    throw new Error(
      `Timed out waiting for plugin build watcher "${workspacePluginPackage.packageName}" to produce ${workspacePluginPackage.pluginEntryPath}.`,
    );
  }

  private createUnexpectedExitError(packageName: string, error: unknown): Error {
    if (error instanceof Error) {
      return new Error(`Plugin build watcher for "${packageName}" failed: ${error.message}`);
    }
    return new Error(`Plugin build watcher for "${packageName}" failed: ${String(error)}`);
  }

  private async exists(filePath: string): Promise<boolean> {
    try {
      await access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private sleep(durationMs: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, durationMs);
    });
  }
}
