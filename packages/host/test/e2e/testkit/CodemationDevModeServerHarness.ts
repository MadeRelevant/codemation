import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export type CodemationDevModeServerSpec = Readonly<{
  baseUrl: string;
  command: string;
  args: ReadonlyArray<string>;
  consumerRootRelativePath: string;
  env: NodeJS.ProcessEnv;
  readyPath: string;
  readyBodyIncludes?: string;
  setupCommands?: ReadonlyArray<
    Readonly<{
      command: string;
      args: ReadonlyArray<string>;
    }>
  >;
  startupTimeoutMs?: number;
}>;

export class CodemationDevModeServerHarness {
  private child: ChildProcess | null = null;
  private stdout = "";
  private stderr = "";

  constructor(
    private readonly repoRoot: string,
    private readonly spec: CodemationDevModeServerSpec,
  ) {}

  static frameworkMode(repoRoot: string): CodemationDevModeServerHarness {
    const sharedEnv = this.createSharedEnvironment();
    return new CodemationDevModeServerHarness(repoRoot, {
      baseUrl: "http://localhost:3200",
      command: "pnpm",
      args: ["dev"],
      consumerRootRelativePath: "apps/test-dev",
      env: {
        ...sharedEnv,
        AUTH_SECRET: "codemation-dev-mode-e2e-auth-secret-0001",
        AUTH_URL: "http://localhost:3200",
        NEXTAUTH_URL: "http://localhost:3200",
        PORT: "3200",
      },
      readyPath: "/login",
      setupCommands: [
        {
          command: "pnpm",
          args: ["codemation", "db", "migrate", "--consumer-root", "apps/test-dev"],
        },
        {
          command: "pnpm",
          args: [
            "codemation",
            "user",
            "create",
            "--email",
            "e2e@codemation.test",
            "--password",
            "E2E-test-password-1!",
            "--consumer-root",
            "apps/test-dev",
          ],
        },
      ],
      startupTimeoutMs: 240_000,
    });
  }

  static pluginMode(repoRoot: string): CodemationDevModeServerHarness {
    const sharedEnv = this.createSharedEnvironment();
    return new CodemationDevModeServerHarness(repoRoot, {
      baseUrl: "http://localhost:3102",
      command: "pnpm",
      args: ["dev:plugin"],
      consumerRootRelativePath: "apps/plugin-dev",
      env: {
        ...sharedEnv,
        AUTH_SECRET: "codemation-dev-mode-e2e-auth-secret-0001",
        AUTH_URL: "http://localhost:3102",
        NEXTAUTH_URL: "http://localhost:3102",
        CODEMATION_CREDENTIALS_MASTER_KEY: "codemation-local-dev-credentials-master-key",
        PORT: "3102",
      },
      readyPath: "/workflows/wf.plugin-dev.http",
      readyBodyIncludes: "canvas-run-workflow-button",
      startupTimeoutMs: 240_000,
    });
  }

  get consumerRootPath(): string {
    return path.resolve(this.repoRoot, this.spec.consumerRootRelativePath);
  }

  get baseUrl(): string {
    return this.spec.baseUrl;
  }

  async start(): Promise<void> {
    await this.resetConsumerState();
    await this.ensureBaseUrlPortIsAvailable();
    await this.runSetupCommands();
    this.child = spawn(this.spec.command, [...this.spec.args], {
      cwd: this.repoRoot,
      detached: true,
      env: this.spec.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.child.stdout?.on("data", (chunk) => {
      this.stdout += String(chunk);
      this.stdout = this.stdout.slice(-20_000);
    });
    this.child.stderr?.on("data", (chunk) => {
      this.stderr += String(chunk);
      this.stderr = this.stderr.slice(-20_000);
    });
    this.child.once("exit", (code, signal) => {
      if (code !== null || signal !== null) {
        this.stderr += `\n[dev-mode-server-exit] code=${String(code)} signal=${String(signal)}\n`;
      }
    });
    await this.waitUntilReady();
  }

  async stop(): Promise<void> {
    const child = this.child;
    this.child = null;
    if (!child?.pid) {
      return;
    }
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch (error) {
      void error;
    }
    await this.waitForExit(child, 15_000);
  }

  async mutateFile(
    relativePath: string,
    mutate: (current: string) => string,
  ): Promise<Readonly<{ restore: () => Promise<void> }>> {
    const absolutePath = path.resolve(this.repoRoot, relativePath);
    const original = await readFile(absolutePath, "utf8");
    const next = mutate(original);
    await writeFile(absolutePath, next, "utf8");
    return {
      restore: async () => {
        await writeFile(absolutePath, original, "utf8");
      },
    };
  }

  private static createSharedEnvironment(): NodeJS.ProcessEnv {
    return {
      ...process.env,
      CODEMATION_LOG_LEVEL: "warn",
      FORCE_COLOR: "0",
    };
  }

  private async resetConsumerState(): Promise<void> {
    await rm(path.resolve(this.consumerRootPath, ".codemation"), {
      force: true,
      recursive: true,
    }).catch(() => null);
    await rm(path.resolve(this.consumerRootPath, ".next"), {
      force: true,
      recursive: true,
    }).catch(() => null);
    await mkdir(path.resolve(this.consumerRootPath, ".codemation"), { recursive: true });
  }

  private async ensureBaseUrlPortIsAvailable(): Promise<void> {
    const port = new URL(this.spec.baseUrl).port;
    if (!port) {
      return;
    }
    const result = spawnSync("ss", ["-lptn", `sport = :${port}`], {
      cwd: this.repoRoot,
      encoding: "utf8",
      stdio: "pipe",
    });
    const matches = [...(result.stdout ?? "").matchAll(/pid=(\d+)/g)];
    for (const match of matches) {
      const pid = Number(match[1]);
      if (!Number.isInteger(pid) || pid <= 0) {
        continue;
      }
      try {
        process.kill(-pid, "SIGKILL");
      } catch (error) {
        void error;
        try {
          process.kill(pid, "SIGKILL");
        } catch (nestedError) {
          void nestedError;
        }
      }
    }
  }

  private async runSetupCommands(): Promise<void> {
    for (const command of this.spec.setupCommands ?? []) {
      const result = spawnSync(command.command, [...command.args], {
        cwd: this.repoRoot,
        env: this.spec.env,
        stdio: "pipe",
        encoding: "utf8",
      });
      if (result.status === 0) {
        continue;
      }
      throw new Error(
        [
          `Setup command failed: ${command.command} ${command.args.join(" ")}`,
          result.stdout ?? "",
          result.stderr ?? "",
        ].join("\n"),
      );
    }
  }

  private async waitUntilReady(): Promise<void> {
    const maxAttempts = Math.ceil((this.spec.startupTimeoutMs ?? 180_000) / 1_000);
    const readyUrl = new URL(this.spec.readyPath, this.spec.baseUrl).toString();
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      if (this.child?.exitCode !== null || this.child?.signalCode !== null) {
        break;
      }
      try {
        const response = await fetch(readyUrl, {
          redirect: "manual",
          signal: AbortSignal.timeout(5_000),
        });
        if (response.status >= 200 && response.status < 400) {
          if (!this.spec.readyBodyIncludes) {
            return;
          }
          const body = await response.text();
          if (body.includes(this.spec.readyBodyIncludes)) {
            return;
          }
        }
      } catch (error) {
        void error;
      }
      await this.sleep(1_000);
    }
    throw new Error(
      [`Timed out waiting for dev server at ${readyUrl}.`, "stdout:", this.stdout, "stderr:", this.stderr].join("\n"),
    );
  }

  private async waitForExit(child: ChildProcess, timeoutMs: number): Promise<void> {
    await Promise.race([
      new Promise<void>((resolve) => {
        child.once("exit", () => resolve());
      }),
      this.sleep(timeoutMs).then(() => {
        try {
          process.kill(-child.pid!, "SIGKILL");
        } catch (error) {
          void error;
        }
      }),
    ]);
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}
