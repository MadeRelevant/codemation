import { mkdir,open,readFile,rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

type CodemationDevLockRecord = Readonly<{
  pid: number;
  startedAt: string;
  consumerRoot: string;
  nextPort: number;
}>;

export class CodemationDevLock {
  private lockPath: string | null = null;

  async acquire(args: Readonly<{ consumerRoot: string; nextPort: number }>): Promise<void> {
    const lockPath = this.resolveLockPath(args.consumerRoot);
    await mkdir(path.dirname(lockPath), { recursive: true });
    const record: CodemationDevLockRecord = {
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

    const existingRecord = await this.readExistingRecord(lockPath);
    if (existingRecord && this.isProcessAlive(existingRecord.pid)) {
      throw new Error(
        `codemation dev is already running for ${args.consumerRoot} (pid=${existingRecord.pid}, port=${existingRecord.nextPort}). Stop it before starting a new dev server.`,
      );
    }

    await rm(lockPath, { force: true }).catch(() => null);
    await this.writeExclusive(lockPath, JSON.stringify(record, null, 2));
    this.lockPath = lockPath;
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

  private async readExistingRecord(lockPath: string): Promise<CodemationDevLockRecord | null> {
    try {
      const raw = await readFile(lockPath, "utf8");
      const parsed = JSON.parse(raw) as Partial<CodemationDevLockRecord>;
      if (
        typeof parsed.pid !== "number" ||
        typeof parsed.startedAt !== "string" ||
        typeof parsed.consumerRoot !== "string" ||
        typeof parsed.nextPort !== "number"
      ) {
        return null;
      }
      return parsed as CodemationDevLockRecord;
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
