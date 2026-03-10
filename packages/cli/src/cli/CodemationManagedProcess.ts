import type { ChildProcess } from "node:child_process";

export class CodemationManagedProcess {
  constructor(private readonly childProcess: ChildProcess) {}

  onExit(onExit: (exitCode: number) => Promise<void>): void {
    this.childProcess.on("exit", (code) => {
      void onExit(code ?? 0);
    });
  }

  async stop(): Promise<void> {
    if (!this.childProcess.pid) return;
    if (this.childProcess.exitCode !== null) return;
    this.childProcess.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      const forceKillTimer = setTimeout(() => {
        if (this.childProcess.exitCode === null) this.childProcess.kill("SIGKILL");
      }, 5000);
      this.childProcess.once("exit", () => {
        clearTimeout(forceKillTimer);
        resolve();
      });
    });
  }
}
