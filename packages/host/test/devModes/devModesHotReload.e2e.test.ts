import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, test } from "vitest";

class LoopbackPortAllocator {
  async allocate(): Promise<number> {
    const server = createServer();
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Failed to allocate a loopback test port.");
    }
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    return address.port;
  }
}

class Eventually {
  static async waitFor<T>(
    probe: () => Promise<T>,
    accept: (value: T) => boolean | Promise<boolean>,
    timeoutMs: number,
    intervalMs: number,
    failureMessage: string,
  ): Promise<T> {
    const deadline = performance.now() + timeoutMs;
    let lastError: unknown = null;
    while (performance.now() < deadline) {
      try {
        const value = await probe();
        if (await accept(value)) {
          return value;
        }
      } catch (error) {
        lastError = error;
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    const suffix =
      lastError instanceof Error
        ? ` Last error: ${lastError.message}`
        : lastError
          ? ` Last error: ${String(lastError)}`
          : "";
    throw new Error(`${failureMessage}.${suffix}`);
  }
}

abstract class TemporaryDevProject {
  protected root: string | null = null;

  async create(): Promise<void> {
    this.root = await mkdtemp(path.join(os.tmpdir(), this.projectPrefix()));
    await writeFile(path.join(this.requireRoot(), "package.json"), JSON.stringify({ type: "module" }, null, 2), "utf8");
    await this.writeProjectFiles();
  }

  async dispose(): Promise<void> {
    if (!this.root) {
      return;
    }
    const currentRoot = this.root;
    this.root = null;
    await rm(currentRoot, { force: true, recursive: true }).catch(() => null);
  }

  protected requireRoot(): string {
    if (!this.root) {
      throw new Error("Temporary project has not been created.");
    }
    return this.root;
  }

  rootPath(): string {
    return this.requireRoot();
  }

  protected async ensureDirectory(relativePath: string): Promise<void> {
    await mkdir(path.join(this.requireRoot(), relativePath), { recursive: true });
  }

  protected async writeRelativeFile(relativePath: string, source: string): Promise<void> {
    await this.ensureDirectory(path.dirname(relativePath));
    await writeFile(path.join(this.requireRoot(), relativePath), source, "utf8");
  }

  abstract updateWorkflowName(name: string): Promise<void>;

  protected abstract projectPrefix(): string;

  protected abstract writeProjectFiles(): Promise<void>;
}

class AppModeDevProject extends TemporaryDevProject {
  async updateWorkflowName(name: string): Promise<void> {
    await this.writeRelativeFile("codemation.config.js", this.createConfigSource(name));
  }

  protected projectPrefix(): string {
    return "codemation-app-dev-hot-reload-";
  }

  protected async writeProjectFiles(): Promise<void> {
    await this.updateWorkflowName("App workflow initial");
  }

  private createConfigSource(name: string): string {
    return [
      "const config = {",
      "  app: {",
      '    auth: { kind: "local", allowUnauthenticatedInDevelopment: true },',
      '    database: { kind: "pglite", pgliteDataDir: ".codemation/pglite" },',
      '    scheduler: { kind: "inline" },',
      "  },",
      "  workflows: [",
      "    {",
      '      id: "wf.dev.app.hot-reload",',
      `      name: ${JSON.stringify(name)},`,
      "      nodes: [],",
      "      edges: [],",
      "    },",
      "  ],",
      "};",
      "",
      "export default config;",
      "",
    ].join("\n");
  }
}

class PluginModeDevProject extends TemporaryDevProject {
  async updateWorkflowName(name: string): Promise<void> {
    await this.writeRelativeFile("codemation.plugin.js", this.createPluginSource(name));
  }

  protected projectPrefix(): string {
    return "codemation-plugin-dev-hot-reload-";
  }

  protected async writeProjectFiles(): Promise<void> {
    await this.updateWorkflowName("Plugin workflow initial");
  }

  private createPluginSource(name: string): string {
    return [
      "const plugin = {",
      "  sandbox: {",
      "    app: {",
      '      auth: { kind: "local", allowUnauthenticatedInDevelopment: true },',
      '      database: { kind: "pglite", pgliteDataDir: ".codemation/pglite" },',
      '      scheduler: { kind: "inline" },',
      "    },",
      "    workflows: [",
      "      {",
      '        id: "wf.dev.plugin.hot-reload",',
      `        name: ${JSON.stringify(name)},`,
      "        nodes: [],",
      "        edges: [],",
      "      },",
      "    ],",
      "  },",
      "};",
      "",
      "export default plugin;",
      "",
    ].join("\n");
  }
}

class DevModeProcessHarness {
  private readonly stdoutChunks: string[] = [];
  private readonly stderrChunks: string[] = [];
  private child: ChildProcessWithoutNullStreams | null = null;

  constructor(
    private readonly commandName: "dev" | "dev:plugin",
    private readonly consumerRoot: string,
    private readonly port: number,
  ) {}

  async start(): Promise<void> {
    const repoRoot = path.resolve(import.meta.dirname, "../../../..");
    const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
    const child = spawn(
      pnpmCommand,
      [
        "exec",
        "tsx",
        "--tsconfig",
        path.join(repoRoot, "tsconfig.codemation-tsx.json"),
        path.join(repoRoot, "packages/cli/src/bin.ts"),
        this.commandName,
        ...this.rootArgument(),
      ],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          PORT: String(this.port),
          AUTH_URL: `http://127.0.0.1:${this.port}`,
          NEXTAUTH_URL: `http://127.0.0.1:${this.port}`,
          AUTH_SECRET: "codemation-dev-hot-reload-e2e-auth-secret",
          CODEMATION_CREDENTIALS_MASTER_KEY: "codemation-dev-hot-reload-master-key",
          CODEMATION_LOG_LEVEL: "warn",
          CHOKIDAR_USEPOLLING: "1",
          NODE_OPTIONS: new NodeOptionsDevelopmentCondition().append(process.env.NODE_OPTIONS),
        },
        stdio: "pipe",
      },
    );
    this.child = child;
    child.stdout.on("data", (chunk: Buffer | string) => {
      this.stdoutChunks.push(chunk.toString());
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      this.stderrChunks.push(chunk.toString());
    });
    await this.waitUntilReady();
  }

  async stop(): Promise<void> {
    const child = this.child;
    this.child = null;
    if (!child) {
      return;
    }
    if (child.exitCode !== null || child.signalCode !== null) {
      return;
    }
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
        }, 10_000);
      }),
    ]);
  }

  async readWorkflowNames(): Promise<ReadonlyArray<string>> {
    const response = await fetch(`http://127.0.0.1:${this.port}/api/workflows`);
    if (!response.ok) {
      throw new Error(`Expected /api/workflows to respond OK, received ${response.status}.`);
    }
    const body = (await response.json()) as ReadonlyArray<Readonly<{ name: string }>>;
    return body.map((workflow) => workflow.name);
  }

  async waitForWorkflowName(name: string): Promise<void> {
    await Eventually.waitFor(
      async () => await this.readWorkflowNames(),
      (workflowNames) => workflowNames.includes(name),
      120_000,
      500,
      `Timed out waiting for workflow "${name}" via ${this.commandName}. Output:\n${this.renderLogs()}`,
    );
  }

  private async waitUntilReady(): Promise<void> {
    await Eventually.waitFor(
      async () => {
        const response = await fetch(`http://127.0.0.1:${this.port}/api/dev/health`);
        return {
          ok: response.ok,
          payload: response.ok ? ((await response.json()) as { runtime?: { status?: string } }) : null,
        };
      },
      (result) => result.ok && result.payload?.runtime?.status === "ready",
      180_000,
      500,
      `Timed out waiting for ${this.commandName} to become ready. Output:\n${this.renderLogs()}`,
    );
  }

  private renderLogs(): string {
    return [`STDOUT:\n${this.stdoutChunks.join("")}`, `STDERR:\n${this.stderrChunks.join("")}`].join("\n");
  }

  private rootArgument(): ReadonlyArray<string> {
    return this.commandName === "dev:plugin"
      ? ["--plugin-root", this.consumerRoot]
      : ["--consumer-root", this.consumerRoot];
  }
}

class NodeOptionsDevelopmentCondition {
  append(existingValue: string | undefined): string {
    const developmentCondition = "--conditions=development";
    if (!existingValue || existingValue.trim().length === 0) {
      return developmentCondition;
    }
    if (existingValue.includes(developmentCondition)) {
      return existingValue;
    }
    return `${existingValue} ${developmentCondition}`.trim();
  }
}

class DevModeHotReloadE2eScenario {
  constructor(
    private readonly project: TemporaryDevProject,
    private readonly commandName: "dev" | "dev:plugin",
    private readonly initialName: string,
    private readonly updatedName: string,
  ) {}

  async run(): Promise<void> {
    const port = await new LoopbackPortAllocator().allocate();
    await this.project.create();
    const harness = new DevModeProcessHarness(this.commandName, this.project.rootPath(), port);
    try {
      await harness.start();
      await harness.waitForWorkflowName(this.initialName);
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      await this.project.updateWorkflowName(this.updatedName);
      await harness.waitForWorkflowName(this.updatedName);
    } finally {
      await harness.stop();
      await this.project.dispose();
    }
  }
}

class DevModeHotReloadE2eResourceRegistry {
  private readonly projects: TemporaryDevProject[] = [];

  register<TProject extends TemporaryDevProject>(project: TProject): TProject {
    this.projects.push(project);
    return project;
  }

  async dispose(): Promise<void> {
    while (this.projects.length > 0) {
      const project = this.projects.pop();
      if (project) {
        await project.dispose();
      }
    }
  }
}

const registry = new DevModeHotReloadE2eResourceRegistry();

afterEach(async () => {
  await registry.dispose();
});

describe("dev mode hot reload", () => {
  test("consumer app mode hot-swaps workflow edits", async () => {
    /**
     * Why this exists:
     * `codemation dev` must do more than boot successfully: after a real source edit, the live
     * HTTP API must reflect the updated workflow without restarting the command. This test owns
     * the end-to-end contract for app-mode file watching + runtime swapping. The lower-level
     * loader cache edge cases are covered separately in focused regression tests.
     */
    const scenario = new DevModeHotReloadE2eScenario(
      registry.register(new AppModeDevProject()),
      "dev",
      "App workflow initial",
      "App workflow updated",
    );

    await scenario.run();
  }, 240_000);

  test("plugin mode hot-swaps plugin entry edits", async () => {
    /**
     * Why this exists:
     * published plugin authors live inside `codemation dev:plugin`, so a broken swap is a
     * release-blocking regression even when the browser still shows "rebuilding workflow".
     * This test owns the end-to-end contract for plugin-mode file watching + runtime swapping by
     * editing the real plugin entry file and asserting that the live dev API exposes the updated
     * workflow. The complementary loader regression test covers the stable wrapper + nested
     * module cache case that previously served stale plugin code after rebuilds.
     */
    const scenario = new DevModeHotReloadE2eScenario(
      registry.register(new PluginModeDevProject()),
      "dev:plugin",
      "Plugin workflow initial",
      "Plugin workflow updated",
    );

    await scenario.run();
  }, 240_000);
});
