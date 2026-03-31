import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { spawn } from "node:child_process";

class SmokeCommandFailure extends Error {
  constructor(command, args, output, exitCode) {
    super(
      [
        `Smoke command failed: ${command} ${args.join(" ")}`,
        `Exit code: ${exitCode ?? "unknown"}`,
        output.trim().length > 0 ? output : "(no output)",
      ].join("\n\n"),
    );
  }
}

class SmokeProcessRunner {
  static async run(command, args, options) {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const output = new SmokeOutputBuffer(child);
    const exitCode = await output.waitForExit();
    if (exitCode !== 0) {
      throw new SmokeCommandFailure(command, args, output.toString(), exitCode);
    }
    return output.toString();
  }

  static spawn(command, args, options) {
    return spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
  }
}

class SmokePseudoTerminalRunner {
  static async run(command, args, options) {
    const shellCommand = this.composeShellCommand(command, args);
    const child = spawn("script", ["-qec", shellCommand, "/dev/null"], {
      cwd: options.cwd,
      env: options.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const output = new SmokeOutputBuffer(child);
    if (Array.isArray(options.promptSequence) && options.promptSequence.length > 0) {
      this.answerPrompts(child, options.promptSequence);
    } else if (typeof options.input === "string") {
      child.stdin?.end(options.input);
    }
    const exitCode = await output.waitForExit();
    if (exitCode !== 0) {
      throw new SmokeCommandFailure(command, args, output.toString(), exitCode);
    }
    return output.toString();
  }

  static answerPrompts(child, promptSequence) {
    let promptIndex = 0;
    let output = "";
    const onData = (chunk) => {
      output += chunk.toString();
      while (promptIndex < promptSequence.length && output.includes(promptSequence[promptIndex].waitFor)) {
        child.stdin?.write(`${promptSequence[promptIndex].response}\r`);
        promptIndex += 1;
      }
      if (promptIndex === promptSequence.length) {
        child.stdin?.end();
        child.stdout?.off("data", onData);
        child.stderr?.off("data", onData);
      }
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
  }

  static composeShellCommand(command, args) {
    return [command, ...args].map((part) => this.quoteShellArgument(part)).join(" ");
  }

  static quoteShellArgument(value) {
    if (/^[a-zA-Z0-9_./:@=-]+$/.test(value)) {
      return value;
    }
    return `'${value.replaceAll("'", `'\\''`)}'`;
  }
}

class SmokeOutputBuffer {
  constructor(child) {
    this.child = child;
    this.chunks = [];
    child.stdout?.on("data", (chunk) => {
      const text = chunk.toString();
      this.chunks.push(text);
      process.stdout.write(text);
    });
    child.stderr?.on("data", (chunk) => {
      const text = chunk.toString();
      this.chunks.push(text);
      process.stderr.write(text);
    });
  }

  async waitForExit(timeoutMs) {
    return await new Promise((resolve, reject) => {
      let timeout = null;
      this.child.once("error", reject);
      this.child.once("close", (code) => {
        if (timeout) {
          clearTimeout(timeout);
        }
        resolve(code ?? 0);
      });
      if (timeoutMs !== undefined) {
        timeout = setTimeout(() => {
          resolve(null);
        }, timeoutMs);
      }
    });
  }

  toString() {
    return this.chunks.join("");
  }
}

class SmokePortAllocator {
  static async allocate() {
    const server = createServer();
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Failed to allocate a loopback port for create-codemation smoke test.");
    }
    await new Promise((resolve, reject) => {
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

class SmokeHttpProbe {
  static async waitUntilReady(url, child, output) {
    await this.waitUntilUrlResponds({
      url,
      child,
      output,
      label: "generated Codemation UI",
    });
  }

  static async waitUntilUrlResponds(args) {
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      if (args.child.exitCode !== null) {
        throw new Error(`${args.label} exited early.\n\n${args.output.toString()}`);
      }
      try {
        const response = await fetch(args.url, {
          redirect: "manual",
        });
        if (response.status >= 200 && response.status < 400) {
          return;
        }
      } catch {
        // Retry until the server is ready or exits.
      }
      await delay(250);
    }
    throw new Error(`Timed out waiting for ${args.label} at ${args.url}.\n\n${args.output.toString()}`);
  }
}

class SmokeVerdaccioConfigFactory {
  static async writeConfig(args) {
    const configPath = path.join(args.registryRoot, "config.yaml");
    await writeFile(
      configPath,
      [
        `storage: ${JSON.stringify(path.join(args.registryRoot, "storage"))}`,
        "max_body_size: 200mb",
        "auth:",
        "  htpasswd:",
        `    file: ${JSON.stringify(path.join(args.registryRoot, "htpasswd"))}`,
        "uplinks:",
        "  npmjs:",
        "    url: https://registry.npmjs.org/",
        "packages:",
        '  "@codemation/*":',
        "    access: $all",
        "    publish: $anonymous",
        "    unpublish: $anonymous",
        '  "create-codemation":',
        "    access: $all",
        "    publish: $anonymous",
        "    unpublish: $anonymous",
        '  "**":',
        "    access: $all",
        "    publish: $anonymous",
        "    proxy: npmjs",
        "middlewares:",
        "  audit:",
        "    enabled: false",
        "log:",
        "  type: stdout",
        "  format: pretty",
        "  level: http",
        "",
      ].join("\n"),
    );
    return configPath;
  }
}

class SmokeVerdaccioServer {
  static localAuthToken = "codemation-local-smoke-token";

  constructor(args) {
    this.child = args.child;
    this.output = args.output;
    this.registryRoot = args.registryRoot;
    this.registryUrl = args.registryUrl;
    this.npmConfigPath = args.npmConfigPath;
  }

  static async start(args) {
    const registryRoot = await mkdtemp(path.join(os.tmpdir(), "codemation-verdaccio-"));
    const port = await SmokePortAllocator.allocate();
    const registryUrl = `http://127.0.0.1:${port}`;
    const configPath = await SmokeVerdaccioConfigFactory.writeConfig({ registryRoot });
    const npmConfigPath = path.join(registryRoot, ".npmrc");
    await writeFile(npmConfigPath, this.createNpmConfigContents(registryUrl));
    const env = this.createProcessEnv({
      baseEnv: process.env,
      npmConfigPath,
      registryUrl,
    });
    const child = SmokeProcessRunner.spawn(
      "pnpm",
      ["exec", "verdaccio", "--config", configPath, "--listen", `127.0.0.1:${port}`],
      {
        cwd: args.repoRoot,
        env,
      },
    );
    const output = new SmokeOutputBuffer(child);
    await SmokeHttpProbe.waitUntilUrlResponds({
      url: registryUrl,
      child,
      output,
      label: "local Verdaccio registry",
    });
    return new SmokeVerdaccioServer({
      child,
      output,
      registryRoot,
      registryUrl,
      npmConfigPath,
    });
  }

  createProcessEnv(baseEnv) {
    return SmokeVerdaccioServer.createProcessEnv({
      baseEnv,
      npmConfigPath: this.npmConfigPath,
      registryUrl: this.registryUrl,
    });
  }

  static createProcessEnv(args) {
    return {
      ...args.baseEnv,
      NPM_CONFIG_REGISTRY: args.registryUrl,
      NPM_CONFIG_USERCONFIG: args.npmConfigPath,
      npm_config_registry: args.registryUrl,
      npm_config_userconfig: args.npmConfigPath,
    };
  }

  static createNpmConfigContents(registryUrl) {
    const registryHost = new URL(registryUrl).host;
    return [
      `registry=${registryUrl}`,
      `@codemation:registry=${registryUrl}`,
      `//${registryHost}/:_authToken=${this.localAuthToken}`,
      "",
    ].join("\n");
  }

  async stop() {
    try {
      if (this.child.exitCode === null) {
        this.child.kill("SIGTERM");
        const exitCode = await this.output.waitForExit(5000);
        if (exitCode === null && this.child.exitCode === null) {
          this.child.kill("SIGKILL");
        }
      }
    } finally {
      await rm(this.registryRoot, { recursive: true, force: true });
    }
  }
}

class SmokeRegistryPublisher {
  static registryPackageSpecs = [
    { name: "@codemation/core", relativeDirectory: "packages/core" },
    { name: "@codemation/core-nodes", relativeDirectory: "packages/core-nodes" },
    { name: "@codemation/eventbus-redis", relativeDirectory: "packages/eventbus-redis" },
    { name: "@codemation/host", relativeDirectory: "packages/host" },
    { name: "@codemation/next-host", relativeDirectory: "packages/next-host" },
    { name: "@codemation/runtime-dev", relativeDirectory: "packages/runtime-dev" },
    { name: "@codemation/dev-gateway", relativeDirectory: "packages/dev-gateway" },
    { name: "@codemation/cli", relativeDirectory: "packages/cli" },
    { name: "create-codemation", relativeDirectory: "packages/create-codemation" },
  ];

  static async publishAll(args) {
    for (const packageSpec of this.registryPackageSpecs) {
      await SmokeProcessRunner.run("pnpm", ["publish", "--registry", args.registryUrl, "--no-git-checks"], {
        cwd: path.join(args.repoRoot, packageSpec.relativeDirectory),
        env: args.env,
      });
    }
  }
}

class CreateCodemationSmoke {
  static installModeEnvName = "CODEMATION_SMOKE_INSTALL_MODE";
  static interactiveOnboardingEnvName = "CODEMATION_SMOKE_INTERACTIVE_ONBOARDING";
  static templateIdEnvName = "CODEMATION_SMOKE_TEMPLATE_ID";
  static adminEmail = "smoke@example.com";
  static adminPassword = "smoke12345";

  static workspaceDependencyNames = [
    "@codemation/cli",
    "@codemation/core",
    "@codemation/core-nodes",
    "@codemation/host",
  ];

  static tarballPackageSpecs = [
    { name: "@codemation/cli", relativeDirectory: "packages/cli" },
    { name: "@codemation/core", relativeDirectory: "packages/core" },
    { name: "@codemation/core-nodes", relativeDirectory: "packages/core-nodes" },
    { name: "@codemation/core-nodes-gmail", relativeDirectory: "packages/core-nodes-gmail" },
    { name: "@codemation/dev-gateway", relativeDirectory: "packages/dev-gateway" },
    { name: "@codemation/eventbus-redis", relativeDirectory: "packages/eventbus-redis" },
    { name: "@codemation/host", relativeDirectory: "packages/host" },
    { name: "@codemation/next-host", relativeDirectory: "packages/next-host" },
    { name: "@codemation/runtime-dev", relativeDirectory: "packages/runtime-dev" },
  ];

  static buildFilters = [
    "--filter=create-codemation",
    "--filter=@codemation/core",
    "--filter=@codemation/core-nodes",
    "--filter=@codemation/eventbus-redis",
    "--filter=@codemation/host",
    "--filter=@codemation/next-host",
    "--filter=@codemation/runtime-dev",
    "--filter=@codemation/dev-gateway",
    "--filter=@codemation/cli",
  ];

  static async run() {
    const repoRoot = this.resolveRepoRoot();
    const installMode = this.resolveInstallMode();
    const interactiveOnboarding = this.resolveInteractiveOnboarding();
    const templateId = this.resolveTemplateId();
    const tempRoot = installMode === "workspace" ? path.join(repoRoot, "apps") : os.tmpdir();
    const appRoot = await mkdtemp(path.join(tempRoot, "create-codemation-smoke-"));
    const tarballRoot =
      installMode === "packed" ? await mkdtemp(path.join(tempRoot, "create-codemation-tarballs-")) : null;
    let registry = null;
    const port = await SmokePortAllocator.allocate();
    const env = {
      ...process.env,
      PORT: String(port),
    };
    try {
      await this.clearStaleNextDevServer(repoRoot);
      await SmokeProcessRunner.run("pnpm", ["exec", "turbo", "run", "build", ...this.buildFilters], {
        cwd: repoRoot,
        env: process.env,
      });
      if (installMode === "registry") {
        registry = await SmokeVerdaccioServer.start({ repoRoot });
        await SmokeRegistryPublisher.publishAll({
          repoRoot,
          registryUrl: registry.registryUrl,
          env: registry.createProcessEnv(process.env),
        });
        if (interactiveOnboarding) {
          await this.scaffoldAppInteractivelyFromRegistry({
            repoRoot,
            appRoot,
            registry,
            templateId,
          });
        } else {
          await this.scaffoldAppFromRegistry({
            repoRoot,
            appRoot,
            registry,
            templateId,
          });
        }
      } else {
        if (interactiveOnboarding) {
          throw new Error("Interactive onboarding smoke is only supported for registry mode.");
        }
        await SmokeProcessRunner.run(
          "node",
          ["packages/create-codemation/bin/create-codemation.js", appRoot, "--template", templateId, "--yes"],
          {
            cwd: repoRoot,
            env: process.env,
          },
        );
      }
      if (installMode === "packed") {
        const tarballs = await this.packLocalArtifacts(repoRoot, tarballRoot);
        await this.rewriteAppToTarballDependencies(appRoot, tarballs);
      } else if (installMode === "workspace") {
        await this.rewriteAppToWorkspaceDependencies(appRoot);
      } else if (registry) {
        await this.writeRegistryNpmrc(appRoot, registry.registryUrl);
      }
      const commandEnv = registry ? registry.createProcessEnv(env) : env;
      const codemationBin = path.join(appRoot, "node_modules", ".bin", "codemation");
      if (!interactiveOnboarding) {
        await SmokeProcessRunner.run("pnpm", ["install", "--lockfile=false"], {
          cwd: appRoot,
          env: commandEnv,
        });
        await SmokeProcessRunner.run(codemationBin, ["db", "migrate"], {
          cwd: appRoot,
          env: commandEnv,
        });
        await SmokeProcessRunner.run(
          codemationBin,
          ["user", "create", "--email", this.adminEmail, "--password", this.adminPassword],
          {
            cwd: appRoot,
            env: commandEnv,
          },
        );
      }
      const child = SmokeProcessRunner.spawn(codemationBin, ["dev"], {
        cwd: appRoot,
        env: commandEnv,
      });
      const output = new SmokeOutputBuffer(child);
      try {
        await SmokeHttpProbe.waitUntilReady(`http://127.0.0.1:${port}`, child, output);
        await delay(5000);
        if (child.exitCode !== null) {
          throw new Error(`Smoke dev server exited during stability window.\n\n${output.toString()}`);
        }
        child.kill("SIGINT");
        await output.waitForExit(5000);
      } finally {
        if (child.exitCode === null) {
          child.kill("SIGTERM");
          const exitCode = await output.waitForExit(5000);
          if (exitCode === null && child.exitCode === null) {
            child.kill("SIGKILL");
          }
        }
      }
    } finally {
      await this.clearStaleNextDevServer(repoRoot);
      if (registry) {
        await registry.stop();
      }
      if (tarballRoot) {
        await rm(tarballRoot, { recursive: true, force: true });
      }
      await rm(appRoot, { recursive: true, force: true });
    }
  }

  static resolveInstallMode() {
    const installMode = process.env[this.installModeEnvName];
    if (installMode === "packed" || installMode === "registry") {
      return installMode;
    }
    return "workspace";
  }

  static resolveInteractiveOnboarding() {
    return process.env[this.interactiveOnboardingEnvName] === "true";
  }

  static resolveTemplateId() {
    const templateId = process.env[this.templateIdEnvName];
    if (templateId === "default" || templateId === "minimal") {
      return templateId;
    }
    return "minimal";
  }

  static resolveRepoRoot() {
    return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
  }

  static async rewriteAppToWorkspaceDependencies(appRoot) {
    const packageJsonPath = path.join(appRoot, "package.json");
    const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
    for (const dependencyName of this.workspaceDependencyNames) {
      if (packageJson.dependencies?.[dependencyName]) {
        packageJson.dependencies[dependencyName] = "workspace:*";
      }
    }
    await writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
  }

  static async packLocalArtifacts(repoRoot, tarballRoot) {
    const tarballs = new Map();
    for (const packageSpec of this.tarballPackageSpecs) {
      const output = await SmokeProcessRunner.run("pnpm", ["pack", "--json", "--pack-destination", tarballRoot], {
        cwd: path.join(repoRoot, packageSpec.relativeDirectory),
        env: process.env,
      });
      const parsed = JSON.parse(output);
      const firstEntry = Array.isArray(parsed) ? parsed[0] : parsed;
      if (!firstEntry || typeof firstEntry.filename !== "string") {
        throw new Error(`Could not determine tarball filename for ${packageSpec.name}.`);
      }
      tarballs.set(packageSpec.name, firstEntry.filename);
    }
    return tarballs;
  }

  static async scaffoldAppFromRegistry(args) {
    const createCodemationVersion = await this.resolveCreateCodemationVersion(args.repoRoot);
    await SmokeProcessRunner.run(
      "pnpm",
      ["dlx", `create-codemation@${createCodemationVersion}`, args.appRoot, "--template", args.templateId, "--yes"],
      {
        cwd: args.repoRoot,
        env: args.registry.createProcessEnv(process.env),
      },
    );
  }

  static async scaffoldAppInteractivelyFromRegistry(args) {
    const createCodemationVersion = await this.resolveCreateCodemationVersion(args.repoRoot);
    await SmokePseudoTerminalRunner.run(
      "pnpm",
      ["dlx", `create-codemation@${createCodemationVersion}`, args.appRoot, "--template", args.templateId],
      {
        cwd: args.repoRoot,
        env: args.registry.createProcessEnv(process.env),
        promptSequence: this.buildInteractiveOnboardingPromptSequence(),
      },
    );
  }

  static buildInteractiveOnboardingPromptSequence() {
    return [
      {
        waitFor: "Do you want authentication enabled? It is recommended and enabled by default. [Y/n]",
        response: "y",
      },
      {
        waitFor: "Admin email:",
        response: this.adminEmail,
      },
      {
        waitFor: "Admin password (min 8 characters):",
        response: this.adminPassword,
      },
      {
        waitFor: "Repeat password:",
        response: this.adminPassword,
      },
    ];
  }

  static async resolveCreateCodemationVersion(repoRoot) {
    const packageJsonPath = path.join(repoRoot, "packages", "create-codemation", "package.json");
    const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
    if (typeof packageJson.version !== "string" || packageJson.version.length === 0) {
      throw new Error("Could not resolve create-codemation version for registry smoke.");
    }
    return packageJson.version;
  }

  static async rewriteAppToTarballDependencies(appRoot, tarballs) {
    const packageJsonPath = path.join(appRoot, "package.json");
    const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
    for (const [dependencyName, tarballPath] of tarballs.entries()) {
      const relativeTarballPath = this.toRelativeTarballSpecifier(appRoot, tarballPath);
      if (packageJson.dependencies?.[dependencyName]) {
        packageJson.dependencies[dependencyName] = relativeTarballPath;
      }
    }
    packageJson.pnpm ??= {};
    packageJson.pnpm.overrides = {
      ...(packageJson.pnpm.overrides ?? {}),
      ...Object.fromEntries(
        Array.from(tarballs.entries()).map(([dependencyName, tarballPath]) => [
          dependencyName,
          this.toRelativeTarballSpecifier(appRoot, tarballPath),
        ]),
      ),
    };
    await writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
  }

  static async writeRegistryNpmrc(appRoot, registryUrl) {
    await writeFile(path.join(appRoot, ".npmrc"), SmokeVerdaccioServer.createNpmConfigContents(registryUrl));
  }

  static toRelativeTarballSpecifier(appRoot, tarballPath) {
    return `file:${path.relative(appRoot, tarballPath).replaceAll(path.sep, "/")}`;
  }

  static async clearStaleNextDevServer(repoRoot) {
    const lockPath = path.join(repoRoot, "packages", "next-host", ".next", "dev", "lock");
    try {
      const parsed = JSON.parse(await readFile(lockPath, "utf8"));
      if (typeof parsed.pid === "number") {
        try {
          process.kill(parsed.pid, "SIGTERM");
          await delay(1000);
        } catch {
          // Process is already gone.
        }
      }
    } catch {
      // No lock file yet.
    }
  }
}

await CreateCodemationSmoke.run();
