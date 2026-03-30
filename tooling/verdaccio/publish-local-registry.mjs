import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";

class LocalRegistryPublishError extends Error {
  constructor(command, args, exitCode) {
    super(`Local registry publish step failed: ${command} ${args.join(" ")} (exit ${exitCode ?? "unknown"})`);
  }
}

class LocalRegistryCommandRunner {
  async run(command, args, cwd, env) {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: "inherit",
    });
    const exitCode = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code) => {
        resolve(code ?? 0);
      });
    });
    if (exitCode !== 0) {
      throw new LocalRegistryPublishError(command, args, exitCode);
    }
  }
}

class LocalRegistryPublisher {
  static buildFilters = [
    "--filter=create-codemation",
    "--filter=@codemation/core",
    "--filter=@codemation/core-nodes",
    "--filter=@codemation/eventbus-redis",
    "--filter=@codemation/queue-bullmq",
    "--filter=@codemation/host",
    "--filter=@codemation/next-host",
    "--filter=@codemation/runtime-dev",
    "--filter=@codemation/dev-gateway",
    "--filter=@codemation/worker-cli",
    "--filter=@codemation/cli",
  ];

  static publishOrder = [
    "packages/core",
    "packages/core-nodes",
    "packages/eventbus-redis",
    "packages/queue-bullmq",
    "packages/host",
    "packages/next-host",
    "packages/runtime-dev",
    "packages/dev-gateway",
    "packages/worker-cli",
    "packages/cli",
    "packages/create-codemation",
  ];

  constructor(runner) {
    this.runner = runner;
    this.repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
    this.registryUrl = process.env.CODEMATION_LOCAL_REGISTRY_URL ?? "http://127.0.0.1:4873";
    this.npmConfigDirectory = null;
    this.npmConfigPath = null;
  }

  async publish() {
    await this.prepareNpmConfig();
    try {
      await this.buildPackages();
      for (const relativeDirectory of LocalRegistryPublisher.publishOrder) {
        await this.publishPackage(relativeDirectory);
      }
    } finally {
      await this.cleanupNpmConfig();
    }
  }

  async buildPackages() {
    await this.runner.run(
      "pnpm",
      ["exec", "turbo", "run", "build", ...LocalRegistryPublisher.buildFilters],
      this.repoRoot,
      process.env,
    );
  }

  async publishPackage(relativeDirectory) {
    const packageManifest = await this.readPackageManifest(relativeDirectory);
    if (await this.hasPublishedVersion(packageManifest)) {
      process.stdout.write(
        `[local-release] Skipping ${packageManifest.name}@${packageManifest.version}; already published to ${this.registryUrl}.\n`,
      );
      return;
    }
    await this.runner.run(
      "pnpm",
      ["publish", "--registry", this.registryUrl, "--no-git-checks"],
      path.join(this.repoRoot, relativeDirectory),
      this.createPublishEnv(),
    );
  }

  createPublishEnv() {
    return {
      ...process.env,
      NPM_CONFIG_REGISTRY: this.registryUrl,
      npm_config_registry: this.registryUrl,
      NPM_CONFIG_USERCONFIG: this.npmConfigPath,
      npm_config_userconfig: this.npmConfigPath,
    };
  }

  async readPackageManifest(relativeDirectory) {
    const packageJsonPath = path.join(this.repoRoot, relativeDirectory, "package.json");
    const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
    return {
      name: packageJson.name,
      version: packageJson.version,
    };
  }

  async hasPublishedVersion(packageManifest) {
    const response = await fetch(`${this.registryUrl}/${this.encodePackageName(packageManifest.name)}`);
    if (response.status === 404) {
      return false;
    }
    if (!response.ok) {
      throw new Error(`Could not inspect ${packageManifest.name} on ${this.registryUrl}: ${response.status}`);
    }
    const body = await response.json();
    return typeof body === "object" && body !== null && packageManifest.version in (body.versions ?? {});
  }

  encodePackageName(packageName) {
    return packageName.startsWith("@") ? packageName.replace("/", "%2f") : packageName;
  }

  async prepareNpmConfig() {
    this.npmConfigDirectory = await mkdtemp(path.join(os.tmpdir(), "codemation-local-registry-npmrc-"));
    this.npmConfigPath = path.join(this.npmConfigDirectory, ".npmrc");
    const registryHost = new URL(this.registryUrl).host;
    await writeFile(
      this.npmConfigPath,
      [
        `registry=${this.registryUrl}`,
        `@codemation:registry=${this.registryUrl}`,
        `//${registryHost}/:_authToken=codemation-local-registry-token`,
        "",
      ].join("\n"),
    );
  }

  async cleanupNpmConfig() {
    if (this.npmConfigDirectory) {
      await rm(this.npmConfigDirectory, { force: true, recursive: true });
    }
  }
}

await new LocalRegistryPublisher(new LocalRegistryCommandRunner()).publish();
