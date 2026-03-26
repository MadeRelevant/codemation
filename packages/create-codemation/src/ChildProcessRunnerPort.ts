/**
 * Runs child processes for post-scaffold onboarding (injectable for tests).
 */
export interface ChildProcessRunnerPort {
  run(
    command: string,
    args: ReadonlyArray<string>,
    options: Readonly<{ cwd: string; env?: NodeJS.ProcessEnv }>,
  ): Promise<void>;
}
