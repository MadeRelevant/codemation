import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { ScaffoldedBrowserRuntimeEnvironment } from "./ScaffoldedBrowserRuntimeEnvironment";

export type ScaffoldedCreateCodemationProjectContract = Readonly<{
  templateId: "default" | "plugin";
  workflowId: string;
  initialWorkflowName: string;
  updatedWorkflowName: string;
  sourceFileRelativePath: string;
  sourceReplacementBefore: string;
  sourceReplacementAfter: string;
}>;

export type ScaffoldedCreateCodemationProjectDependencyMode = "workspace" | "published" | "packed";

type SpawnResult = Readonly<{
  exitCode: number;
  output: string;
}>;

export class ScaffoldedCreateCodemationProject {
  private static readonly adminEmail = "playwright-auth@example.com";
  private static readonly adminPassword = "playwright12345";
  private static readonly packedDependencyPackageDirectories = [
    "packages/core",
    "packages/core-nodes",
    "packages/core-nodes-gmail",
    "packages/eventbus-redis",
    "packages/host",
    "packages/next-host",
    "packages/cli",
  ] as const;
  private static readonly workspaceDependencyNames = [
    "@codemation/cli",
    "@codemation/core",
    "@codemation/core-nodes",
    "@codemation/core-nodes-gmail",
    "@codemation/eventbus-redis",
    "@codemation/host",
    "@codemation/next-host",
  ];

  private projectRoot: string | null = null;
  private packedArtifactsRoot: string | null = null;
  private readonly runtimeEnvironment = new ScaffoldedBrowserRuntimeEnvironment();

  constructor(
    private readonly repoRoot: string,
    private readonly contract: ScaffoldedCreateCodemationProjectContract,
    private readonly dependencyMode: ScaffoldedCreateCodemationProjectDependencyMode = "workspace",
  ) {}

  async create(): Promise<void> {
    const tempRoot = this.resolveTempRoot();
    await mkdir(tempRoot, { recursive: true });
    this.projectRoot = await mkdtemp(path.join(tempRoot, `create-codemation-${this.contract.templateId}-browser-e2e-`));
    await this.runCommand(
      "node",
      [
        "packages/create-codemation/bin/create-codemation.js",
        this.rootPath(),
        "--template",
        this.contract.templateId,
        "--yes",
      ],
      {
        cwd: this.repoRoot,
        env: process.env,
      },
    );
    if (this.dependencyMode === "workspace") {
      await this.rewriteWorkspaceDependencies();
      await this.runCommand("pnpm", ["install", "--lockfile=false"], {
        cwd: this.rootPath(),
        env: process.env,
      });
      return;
    }
    const installCommandArgs =
      this.dependencyMode === "packed"
        ? await this.preparePackedInstallArguments()
        : (["install", "--lockfile=false"] as const);
    await this.runCommand("pnpm", [...installCommandArgs], {
      cwd: this.rootPath(),
      env: this.publishedInstallEnvironment(),
    });
    const execPrefix = this.dependencyMode === "packed" ? ["--ignore-workspace", "exec"] : ["exec"];
    await this.runCommand("pnpm", [...execPrefix, "codemation", "db", "migrate"], {
      cwd: this.rootPath(),
      env: this.publishedInstallEnvironment(),
    });
    await this.runCommand(
      "pnpm",
      [
        ...execPrefix,
        "codemation",
        "user",
        "create",
        "--email",
        ScaffoldedCreateCodemationProject.adminEmail,
        "--password",
        ScaffoldedCreateCodemationProject.adminPassword,
      ],
      {
        cwd: this.rootPath(),
        env: this.publishedInstallEnvironment(),
      },
    );
  }

  async dispose(): Promise<void> {
    if (!this.projectRoot) {
      return;
    }
    const currentRoot = this.projectRoot;
    this.projectRoot = null;
    await rm(currentRoot, { recursive: true, force: true });
    if (this.packedArtifactsRoot) {
      const currentArtifactsRoot = this.packedArtifactsRoot;
      this.packedArtifactsRoot = null;
      await rm(currentArtifactsRoot, { recursive: true, force: true });
    }
  }

  rootPath(): string {
    if (!this.projectRoot) {
      throw new Error("Scaffolded project has not been created.");
    }
    return this.projectRoot;
  }

  workflowPath(): string {
    return path.join(this.rootPath(), this.contract.sourceFileRelativePath);
  }

  workflowId(): string {
    return this.contract.workflowId;
  }

  initialWorkflowName(): string {
    return this.contract.initialWorkflowName;
  }

  updatedWorkflowName(): string {
    return this.contract.updatedWorkflowName;
  }

  adminCredentials(): Readonly<{ email: string; password: string }> {
    return {
      email: ScaffoldedCreateCodemationProject.adminEmail,
      password: ScaffoldedCreateCodemationProject.adminPassword,
    };
  }

  async applyHotReloadEdit(): Promise<void> {
    const workflowPath = this.workflowPath();
    const originalSource = await readFile(workflowPath, "utf8");
    if (!originalSource.includes(this.contract.sourceReplacementBefore)) {
      throw new Error(
        `Expected ${this.contract.sourceFileRelativePath} to contain ${this.contract.sourceReplacementBefore}.`,
      );
    }
    const updatedSource = originalSource.replace(
      this.contract.sourceReplacementBefore,
      this.contract.sourceReplacementAfter,
    );
    await writeFile(workflowPath, updatedSource, "utf8");
  }

  private async rewriteWorkspaceDependencies(): Promise<void> {
    const packageJsonPath = path.join(this.rootPath(), "package.json");
    const packageJson = await this.readPackageJson(packageJsonPath);
    for (const dependencyName of ScaffoldedCreateCodemationProject.workspaceDependencyNames) {
      if (packageJson.dependencies?.[dependencyName]) {
        packageJson.dependencies[dependencyName] = "workspace:*";
      }
      if (packageJson.devDependencies?.[dependencyName]) {
        packageJson.devDependencies[dependencyName] = "workspace:*";
      }
    }
    packageJson.pnpm ??= {};
    packageJson.pnpm.overrides = {
      ...(packageJson.pnpm.overrides ?? {}),
      ...Object.fromEntries(
        ScaffoldedCreateCodemationProject.workspaceDependencyNames.map((dependencyName) => [
          dependencyName,
          "workspace:*",
        ]),
      ),
    };
    await writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
  }

  private async preparePackedInstallArguments(): Promise<ReadonlyArray<string>> {
    const packedDependencies = await this.packLocalDependencies();
    await this.rewritePackedDependencies(packedDependencies);
    return ["install", "--lockfile=false", "--ignore-workspace"];
  }

  private async rewritePackedDependencies(packedDependencies: Readonly<Record<string, string>>): Promise<void> {
    const packageJsonPath = path.join(this.rootPath(), "package.json");
    const packageJson = await this.readPackageJson(packageJsonPath);
    packageJson.dependencies ??= {};
    packageJson.devDependencies ??= {};
    for (const [dependencyName, dependencyValue] of Object.entries(packedDependencies)) {
      if (packageJson.dependencies[dependencyName]) {
        packageJson.dependencies[dependencyName] = dependencyValue;
      }
      if (packageJson.devDependencies[dependencyName]) {
        packageJson.devDependencies[dependencyName] = dependencyValue;
      }
    }
    packageJson.pnpm ??= {};
    packageJson.pnpm.overrides = {
      ...(packageJson.pnpm.overrides ?? {}),
      ...packedDependencies,
    };
    await writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
  }

  private async packLocalDependencies(): Promise<Readonly<Record<string, string>>> {
    const artifactsRoot = await this.ensurePackedArtifactsRoot();
    for (const relativeDirectory of ScaffoldedCreateCodemationProject.packedDependencyPackageDirectories) {
      const packageDirectory = path.join(this.repoRoot, relativeDirectory);
      const packageJson = JSON.parse(await readFile(path.join(packageDirectory, "package.json"), "utf8")) as {
        name: string;
      };
      await this.runCommand("pnpm", ["--filter", packageJson.name, "build"], {
        cwd: this.repoRoot,
        env: process.env,
      });
    }
    const packedDependencies: Record<string, string> = {};
    for (const relativeDirectory of ScaffoldedCreateCodemationProject.packedDependencyPackageDirectories) {
      const packageDirectory = path.join(this.repoRoot, relativeDirectory);
      const packageJson = JSON.parse(await readFile(path.join(packageDirectory, "package.json"), "utf8")) as {
        name: string;
        version: string;
      };
      await this.runCommand("pnpm", ["pack", "--pack-destination", artifactsRoot], {
        cwd: packageDirectory,
        env: process.env,
      });
      packedDependencies[packageJson.name] = `file:${path.join(
        artifactsRoot,
        this.tarballFileName(packageJson.name, packageJson.version),
      )}`;
    }
    return packedDependencies;
  }

  private async ensurePackedArtifactsRoot(): Promise<string> {
    if (this.packedArtifactsRoot) {
      return this.packedArtifactsRoot;
    }
    const proofRoot = path.join(this.repoRoot, ".tmp-proof");
    await mkdir(proofRoot, { recursive: true });
    this.packedArtifactsRoot = await mkdtemp(path.join(proofRoot, "scaffolded-packed-browser-e2e-"));
    return this.packedArtifactsRoot;
  }

  private tarballFileName(packageName: string, version: string): string {
    return `${packageName.replace(/^@/, "").replace(/\//g, "-")}-${version}.tgz`;
  }

  private async readPackageJson(packageJsonPath: string): Promise<{
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    pnpm?: {
      overrides?: Record<string, string>;
    };
  }> {
    return JSON.parse(await readFile(packageJsonPath, "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      pnpm?: {
        overrides?: Record<string, string>;
      };
    };
  }

  private publishedInstallEnvironment(): NodeJS.ProcessEnv {
    return this.runtimeEnvironment.createPublishedInstallEnvironment(process.env);
  }

  private async runCommand(
    command: string,
    args: ReadonlyArray<string>,
    options: Readonly<{ cwd: string; env: NodeJS.ProcessEnv }>,
  ): Promise<SpawnResult> {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const chunks: string[] = [];
    child.stdout.on("data", (chunk: Buffer | string) => {
      chunks.push(chunk.toString());
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      chunks.push(chunk.toString());
    });
    const exitCode = await new Promise<number>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code) => resolve(code ?? 1));
    });
    const output = chunks.join("");
    if (exitCode !== 0) {
      throw new Error([`Command failed: ${command} ${args.join(" ")}`, `cwd: ${options.cwd}`, output].join("\n\n"));
    }
    return { exitCode, output };
  }

  private resolveTempRoot(): string {
    if (this.dependencyMode === "workspace") {
      return path.join(this.repoRoot, "apps");
    }
    return path.join(this.repoRoot, ".tmp-proof");
  }
}
