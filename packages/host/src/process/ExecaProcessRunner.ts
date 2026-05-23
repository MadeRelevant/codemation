import type { ChildProcess } from "node:child_process";
import { execa, execaSync, type Options as ExecaOptions, type SyncOptions as ExecaSyncOptions } from "execa";

import type { ProcessRunner, ProcessRunOptions, ProcessRunResult } from "./ProcessRunner.types";

/**
 * Production {@link ProcessRunner}. Defers cross-platform executable resolution (`pnpm` ↔ `pnpm.cmd`,
 * `.cmd` / `.bat` / `.ps1` shims on Windows) and argument quoting to execa so call sites stop having
 * to hand-roll platform conditionals.
 */
export class ExecaProcessRunner implements ProcessRunner {
  spawn(command: string, args: ReadonlyArray<string>, options?: ProcessRunOptions): ChildProcess {
    return execa(command, [...args], this.toExecaOptions(options)) as unknown as ChildProcess;
  }

  runSync(command: string, args: ReadonlyArray<string>, options?: ProcessRunOptions): ProcessRunResult {
    const result = execaSync(command, [...args], this.toExecaSyncOptions(options));
    return { exitCode: result.exitCode ?? null };
  }

  private toExecaOptions(options?: ProcessRunOptions): ExecaOptions {
    return {
      reject: false,
      cwd: options?.cwd,
      env: options?.env,
      stdio: options?.stdio as ExecaOptions["stdio"],
      detached: options?.detached,
      windowsHide: options?.windowsHide,
    };
  }

  private toExecaSyncOptions(options?: ProcessRunOptions): ExecaSyncOptions {
    return {
      reject: false,
      cwd: options?.cwd,
      env: options?.env,
      stdio: options?.stdio as ExecaSyncOptions["stdio"],
      windowsHide: options?.windowsHide,
    };
  }
}
