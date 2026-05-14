import { spawn } from "node:child_process";
import { mkdir, open, readFile, rm } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

type DevLockRecord = Readonly<{
  pid: number;
  startedAt: string;
  consumerRoot: string;
  nextPort: number;
}>;

export class DevLock {
  private lockPath: string | null = null;

  async acquire(args: Readonly<{ consumerRoot: string; nextPort: number }>): Promise<void> {
    const lockPath = this.resolveLockPath(args.consumerRoot);
    await mkdir(path.dirname(lockPath), { recursive: true });
    const record: DevLockRecord = {
      pid: process.pid,
      startedAt: new Date().toISOString(),
      consumerRoot: args.consumerRoot,
      nextPort: args.nextPort,
    };
    try {
      await this.writeExclusive(lockPath, JSON.stringify(record, null, 2));
      this.lockPath = lockPath;
      return;
    } catch (error) {
      const errorWithCode = error as Error & Readonly<{ code?: unknown }>;
      if (errorWithCode.code !== "EEXIST") {
        throw error;
      }
    }

    // EEXIST. Rather than refusing to start, reap the previous session — both
    // the recorded pid (if still alive) and anything still holding the recorded
    // port (orphaned children that outlived a crashed CLI parent). The user
    // explicitly opted into running `codemation dev` for this consumer; we own
    // the resources for this consumer and should reclaim them.
    const existingRecord = await this.readExistingRecord(lockPath);
    if (existingRecord) {
      process.stdout.write(
        `[codemation] Reaping previous dev session (pid=${existingRecord.pid}, port=${existingRecord.nextPort})…\n`,
      );
      if (this.isProcessAlive(existingRecord.pid)) {
        await this.killProcessTree(existingRecord.pid);
      }
      await this.reapPort(existingRecord.nextPort);
    }

    await rm(lockPath, { force: true }).catch(() => null);
    await this.writeExclusive(lockPath, JSON.stringify(record, null, 2));
    this.lockPath = lockPath;
  }

  private async killProcessTree(pid: number): Promise<void> {
    // SIGTERM the process group first (covers non-detached children), then the
    // pid itself. Wait up to ~2s for graceful exit, then SIGKILL stragglers.
    this.signalSafely(-pid, "SIGTERM");
    this.signalSafely(pid, "SIGTERM");
    for (let attempt = 0; attempt < 20; attempt++) {
      if (!this.isProcessAlive(pid)) return;
      await delay(100);
    }
    this.signalSafely(-pid, "SIGKILL");
    this.signalSafely(pid, "SIGKILL");
  }

  private async reapPort(port: number): Promise<void> {
    // Children spawned with `detached: true` live in their own process group
    // and survive when the CLI parent dies. Find them via `lsof -ti:<port>` and
    // kill. Polls for up to ~3s, then SIGKILLs anything still holding the port.
    const initial = await this.findPidsOnPort(port);
    for (const pid of initial) {
      this.signalSafely(pid, "SIGTERM");
    }
    for (let attempt = 0; attempt < 30; attempt++) {
      if (await this.isPortFree(port)) return;
      await delay(100);
    }
    const stragglers = await this.findPidsOnPort(port);
    for (const pid of stragglers) {
      this.signalSafely(pid, "SIGKILL");
    }
  }

  private signalSafely(pid: number, signal: NodeJS.Signals): void {
    try {
      process.kill(pid, signal);
    } catch {
      // Process / group already gone, permission denied on an unrelated pid, etc.
      // Best-effort cleanup; downstream port-free check is the real gate.
    }
  }

  private async findPidsOnPort(port: number): Promise<number[]> {
    return await new Promise<number[]>((resolve) => {
      const proc = spawn("lsof", ["-ti", `:${port}`], {
        stdio: ["ignore", "pipe", "ignore"],
      });
      let stdout = "";
      proc.stdout?.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      proc.on("close", () => {
        const pids = stdout
          .split("\n")
          .map((line) => Number.parseInt(line.trim(), 10))
          .filter((pid) => Number.isInteger(pid) && pid > 0);
        resolve(pids);
      });
      proc.on("error", () => resolve([]));
    });
  }

  private async isPortFree(port: number): Promise<boolean> {
    return await new Promise<boolean>((resolve) => {
      const tester = createServer();
      tester.once("error", () => resolve(false));
      tester.once("listening", () => {
        tester.close(() => resolve(true));
      });
      tester.listen(port, "127.0.0.1");
    });
  }

  async release(): Promise<void> {
    if (!this.lockPath) {
      return;
    }
    const lockPath = this.lockPath;
    this.lockPath = null;
    await rm(lockPath, { force: true }).catch(() => null);
  }

  private resolveLockPath(consumerRoot: string): string {
    return path.resolve(consumerRoot, ".codemation", "dev.lock");
  }

  private async writeExclusive(filePath: string, contents: string): Promise<void> {
    const handle = await open(filePath, "wx");
    try {
      await handle.writeFile(contents, "utf8");
    } finally {
      await handle.close().catch(() => null);
    }
  }

  private async readExistingRecord(lockPath: string): Promise<DevLockRecord | null> {
    try {
      const raw = await readFile(lockPath, "utf8");
      const parsed = JSON.parse(raw) as Partial<DevLockRecord>;
      if (
        typeof parsed.pid !== "number" ||
        typeof parsed.startedAt !== "string" ||
        typeof parsed.consumerRoot !== "string" ||
        typeof parsed.nextPort !== "number"
      ) {
        return null;
      }
      return parsed as DevLockRecord;
    } catch {
      return null;
    }
  }

  private isProcessAlive(pid: number): boolean {
    if (!Number.isInteger(pid) || pid <= 0) {
      return false;
    }
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }
}
