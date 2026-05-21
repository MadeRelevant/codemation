import type { ChildProcess } from "node:child_process";

export type ProcessRunOptions = Readonly<{
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  /**
   * Mirrors `child_process.SpawnOptions["stdio"]`. The runner forwards the value verbatim to the
   * underlying subprocess, so callers that need fine-grained per-fd control (e.g.
   * `["ignore", "pipe", "pipe"]`) can pass a tuple.
   */
  stdio?: "inherit" | "pipe" | "ignore" | ReadonlyArray<"inherit" | "pipe" | "ignore">;
  /**
   * On Unix this detaches the child from the parent's process group so it becomes the group
   * leader (used by {@link DevTrackedProcessTreeKiller} to broadcast SIGTERM to descendants).
   * On Windows it is ignored — `windowsHide` should be used to suppress console windows instead.
   */
  detached?: boolean;
  windowsHide?: boolean;
}>;

export type ProcessRunResult = Readonly<{
  exitCode: number | null;
}>;

/**
 * Cross-platform process spawning seam. Implementations resolve bare CLI names (`pnpm`, `prisma`,
 * `next`, …) against the OS PATH using OS-appropriate executable lookup, so call sites stop having
 * to remember `pnpm.cmd` or `shell: true` on Windows.
 *
 * `spawn` returns a Node `ChildProcess` so existing helpers like `DevNextChildProcessOutputFilter`
 * and `DevTrackedProcessTreeKiller` keep working unchanged.
 */
export interface ProcessRunner {
  /** Long-lived child (dev watcher, Next dev server). Returns a `ChildProcess`. */
  spawn(command: string, args: ReadonlyArray<string>, options?: ProcessRunOptions): ChildProcess;

  /** Synchronous one-shot (used by Prisma migrate deploy). */
  runSync(command: string, args: ReadonlyArray<string>, options?: ProcessRunOptions): ProcessRunResult;
}
