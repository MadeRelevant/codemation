import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

import { Eventually } from "./Eventually";
import { ScaffoldedBrowserRuntimeEnvironment } from "./ScaffoldedBrowserRuntimeEnvironment";

export type ScaffoldedDevCommandName = "dev" | "dev:plugin";

type DevHealthPayload = Readonly<{
  runtime?: Readonly<{
    status?: string;
  }>;
}>;

type ScaffoldedDevArtifactMetadata = {
  command: string;
  cwd: string;
  port: number;
  baseUrl: string;
  workflowUrl: string | null;
  readinessTimeMs: number | null;
  hotReloadVisibleLatencyMs: number | null;
  envOverrides: Readonly<Record<string, string>>;
  matchedError: string | null;
};

export class ScaffoldedDevServerHarness {
  private readonly stdoutChunks: string[] = [];
  private readonly stderrChunks: string[] = [];
  private readonly metadata: ScaffoldedDevArtifactMetadata;
  private readonly runtimeEnvironment = new ScaffoldedBrowserRuntimeEnvironment();
  private child: ChildProcessWithoutNullStreams | null = null;

  constructor(
    private readonly projectRoot: string,
    private readonly commandName: ScaffoldedDevCommandName,
    private readonly port: number,
    private readonly artifactRoot: string,
  ) {
    this.metadata = {
      command: `${this.codemationBinPath()} ${this.commandName}`,
      cwd: this.projectRoot,
      port: this.port,
      baseUrl: this.baseUrl(),
      workflowUrl: null,
      readinessTimeMs: null,
      hotReloadVisibleLatencyMs: null,
      envOverrides: this.environmentOverrides(),
      matchedError: null,
    };
  }

  async start(): Promise<void> {
    await mkdir(this.artifactRoot, { recursive: true });
    const child = spawn(this.codemationBinPath(), [this.commandName], {
      cwd: this.projectRoot,
      env: {
        ...process.env,
        ...this.environmentOverrides(),
      },
      stdio: "pipe",
    });
    this.child = child;
    child.stdout.on("data", (chunk: Buffer | string) => {
      this.stdoutChunks.push(chunk.toString());
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      this.stderrChunks.push(chunk.toString());
    });
    const startedAt = performance.now();
    try {
      await this.waitUntilReady();
      this.metadata.readinessTimeMs = Math.round(performance.now() - startedAt);
    } catch (error) {
      this.metadata.matchedError = this.findMatchedError();
      await this.persistArtifacts();
      throw error;
    }
  }

  async stop(): Promise<void> {
    const child = this.child;
    this.child = null;
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
      await Promise.race([
        new Promise<void>((resolve) => {
          child.once("exit", () => resolve());
        }),
        new Promise<void>((resolve) => {
          setTimeout(() => {
            if (child.exitCode === null && child.signalCode === null) {
              child.kill("SIGKILL");
            }
            resolve();
          }, 15_000);
        }),
      ]);
    }
    this.metadata.matchedError = this.findMatchedError();
    await this.persistArtifacts();
  }

  baseUrl(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  workflowUrl(workflowId: string): string {
    return `${this.baseUrl()}/workflows/${encodeURIComponent(workflowId)}`;
  }

  noteWorkflowRoute(workflowId: string): void {
    this.metadata.workflowUrl = this.workflowUrl(workflowId);
  }

  noteHotReloadVisibleLatencyMs(value: number): void {
    this.metadata.hotReloadVisibleLatencyMs = value;
  }

  async waitForWorkflowListed(workflowId: string): Promise<void> {
    await Eventually.waitFor(
      async () => {
        const response = await fetch(`${this.baseUrl()}/api/workflows`);
        if (!response.ok) {
          throw new Error(`Expected /api/workflows to respond OK, received ${response.status}.`);
        }
        return (await response.json()) as ReadonlyArray<Readonly<{ id: string }>>;
      },
      (workflows) => workflows.some((workflow) => workflow.id === workflowId),
      120_000,
      500,
      `Timed out waiting for workflow ${workflowId} to appear via ${this.commandName}. Output:\n${this.renderLogs()}`,
    );
  }

  async waitForWorkflowPageReady(workflowId: string): Promise<void> {
    await Eventually.waitFor(
      async () => {
        const response = await fetch(this.workflowUrl(workflowId), {
          redirect: "manual",
        });
        return response.status;
      },
      (status) => status >= 200 && status < 400,
      120_000,
      500,
      `Timed out waiting for workflow page ${workflowId} via ${this.commandName}. Output:\n${this.renderLogs()}`,
    );
  }

  async waitForAuthSessionReady(): Promise<void> {
    await Eventually.waitFor(
      async () => {
        const response = await fetch(`${this.baseUrl()}/api/auth/session`, {
          redirect: "manual",
        });
        return response.status;
      },
      (status) => status === 200,
      120_000,
      500,
      `Timed out waiting for auth session via ${this.commandName}. Output:\n${this.renderLogs()}`,
    );
  }

  private async waitUntilReady(): Promise<void> {
    await Eventually.waitFor(
      async () => {
        if (this.child?.exitCode !== null) {
          throw new Error(`Dev process exited early.\n\n${this.renderLogs()}`);
        }
        const response = await fetch(`${this.baseUrl()}/api/dev/health`);
        return {
          ok: response.ok,
          payload: response.ok ? ((await response.json()) as DevHealthPayload) : null,
        };
      },
      (result) => result.ok && result.payload?.runtime?.status === "ready",
      240_000,
      500,
      `Timed out waiting for ${this.commandName} to become ready. Output:\n${this.renderLogs()}`,
    );
    // Runtime can be ready before `codemation dev` finishes `spawnPackagedUi` (Next `next start`).
    // `/api/auth/*` is served by the disposable runtime, so session checks can pass while the UI
    // proxy target is not accepting traffic yet — wait for a real UI route through the gateway.
    await Eventually.waitFor(
      async () => {
        if (this.child?.exitCode !== null) {
          throw new Error(`Dev process exited early.\n\n${this.renderLogs()}`);
        }
        const response = await fetch(`${this.baseUrl()}/login`, { redirect: "manual" });
        return response.status;
      },
      (status) => status >= 200 && status < 400,
      240_000,
      500,
      `Timed out waiting for packaged UI /login via gateway during ${this.commandName}. Output:\n${this.renderLogs()}`,
    );
  }

  private codemationBinPath(): string {
    return path.join(
      this.projectRoot,
      "node_modules",
      ".bin",
      process.platform === "win32" ? "codemation.cmd" : "codemation",
    );
  }

  private environmentOverrides(): Readonly<Record<string, string>> {
    return this.runtimeEnvironment.createDevServerEnvironment(process.env, this.port);
  }

  private renderLogs(): string {
    return [`STDOUT:\n${this.stdoutChunks.join("")}`, `STDERR:\n${this.stderrChunks.join("")}`].join("\n");
  }

  private findMatchedError(): string | null {
    const output = `${this.stdoutChunks.join("")}\n${this.stderrChunks.join("")}`;
    const errorMatch = output.match(/Error:[^\n]+/);
    return errorMatch?.[0] ?? null;
  }

  private async persistArtifacts(): Promise<void> {
    await mkdir(this.artifactRoot, { recursive: true });
    const terminalPath = path.join(this.artifactRoot, "terminal.log");
    const metadataPath = path.join(this.artifactRoot, "metadata.json");
    const existingTerminal = await this.readExistingFile(terminalPath);
    const nextTerminal = `${existingTerminal}${existingTerminal.length > 0 ? "\n\n" : ""}${this.renderLogs()}`;
    await writeFile(terminalPath, nextTerminal, "utf8");
    await writeFile(metadataPath, `${JSON.stringify(this.metadata, null, 2)}\n`, "utf8");
  }

  private async readExistingFile(filePath: string): Promise<string> {
    try {
      return await readFile(filePath, "utf8");
    } catch {
      return "";
    }
  }
}
