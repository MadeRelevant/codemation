import fs from "node:fs";
import path from "node:path";

import type { ChildProcessRunnerPort } from "./ChildProcessRunnerPort";
import type { FileSystemPort } from "./FileSystemPort";
import type { InteractivePromptPort } from "./InteractivePromptPort";
import type { PostScaffoldOnboardingPort } from "./PostScaffoldOnboardingPort";
import type { TextOutputPort } from "./TextOutputPort";

export class PostScaffoldOnboardingCoordinator implements PostScaffoldOnboardingPort {
  constructor(
    private readonly stdout: TextOutputPort,
    private readonly prompts: InteractivePromptPort,
    private readonly fs: FileSystemPort,
    private readonly processRunner: ChildProcessRunnerPort,
    private readonly stdinIsTTY: boolean,
  ) {}

  async runAfterScaffold(
    args: Readonly<{
      targetDirectory: string;
      noInteraction: boolean;
      adminUser?: Readonly<{ email: string; password: string }>;
    }>,
  ): Promise<void> {
    const noInteraction = args.noInteraction || !this.stdinIsTTY;
    const providedAdminUser = this.resolveProvidedAdminUser(args.adminUser);
    if (!args.noInteraction && !this.stdinIsTTY && providedAdminUser === undefined) {
      this.stdout.write(
        "\nNote: stdin is not a TTY; skipping interactive onboarding. Use --no-interaction to hide this message next time.\n",
      );
    }
    if (noInteraction && providedAdminUser === undefined) {
      this.printManualSteps(args.targetDirectory);
      return;
    }
    await this.ensureDefaultEnvFile(args.targetDirectory);
    const authSetup = providedAdminUser ?? (noInteraction ? null : await this.resolveAuthenticationSetup());
    await this.installDependencies(args.targetDirectory);
    await this.runDatabaseMigrations(args.targetDirectory);
    if (authSetup) {
      await this.createAdminUser(args.targetDirectory, authSetup);
      await this.disableDevelopmentAuthBypass(args.targetDirectory);
    } else {
      this.stdout.write("\nAuthentication skipped. You can create a user later if you decide to enable auth.\n");
    }
    const packageManager = this.resolvePackageManagerFromTargetDirectory(args.targetDirectory);
    this.stdout.write("\nDone. Start the app with:\n");
    this.stdout.write(`  cd ${path.basename(args.targetDirectory)}\n`);
    this.stdout.write(`  ${packageManager.runDevCommand}\n\n`);
  }

  private resolveProvidedAdminUser(
    adminUser: Readonly<{ email: string; password: string }> | undefined,
  ): Readonly<{ email: string; password: string }> | undefined {
    if (adminUser === undefined) {
      return undefined;
    }
    if (!this.isValidEmail(adminUser.email)) {
      throw new Error("create-codemation: --admin-email must be a valid email address.");
    }
    if (adminUser.password.length < 8) {
      throw new Error("create-codemation: --admin-password must be at least 8 characters long.");
    }
    return adminUser;
  }

  private async resolveAuthenticationSetup(): Promise<Readonly<{ email: string; password: string }> | null> {
    while (true) {
      const requiresAuth = await this.prompts.confirm(
        "\nDo you want authentication enabled? It is recommended and enabled by default.",
        { defaultValue: true },
      );
      if (!requiresAuth) {
        return null;
      }
      const authSetup = await this.promptForAuthenticationDetails();
      if (authSetup) {
        return authSetup;
      }
    }
  }

  private async promptForAuthenticationDetails(): Promise<Readonly<{ email: string; password: string }> | null> {
    const email = await this.prompts.question("Admin email: ");
    const password = await this.prompts.question("Admin password (min 8 characters): ", { maskInput: true });
    const passwordAgain = await this.prompts.question("Repeat password: ", { maskInput: true });
    if (this.isAuthSetupSkipped(email, password, passwordAgain)) {
      this.stdout.write("\nAuthentication details were left empty; returning to the authentication question.\n");
      return null;
    }
    if (!this.isValidEmail(email)) {
      this.stdout.write(
        "That does not look like a valid email. Leave auth details empty if you want to continue without authentication.\n",
      );
      return null;
    }
    if (password.length < 8 || password !== passwordAgain) {
      this.stdout.write(
        "Passwords must match and be at least 8 characters. Leave auth details empty if you want to continue without authentication.\n",
      );
      return null;
    }
    return { email, password };
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  private isAuthSetupSkipped(email: string, password: string, passwordAgain: string): boolean {
    return email.length === 0 && password.length === 0 && passwordAgain.length === 0;
  }

  private printManualSteps(targetDirectory: string): void {
    const name = path.basename(targetDirectory);
    const packageManager = this.resolvePackageManagerFromTargetDirectory(targetDirectory);
    this.stdout.write(`\nNext steps for ${name}:\n`);
    this.stdout.write(`  cd ${name}\n`);
    this.stdout.write("  # .env is already created with zero-setup PGlite defaults.\n");
    this.stdout.write(`  ${packageManager.installCommand}\n`);
    this.stdout.write(`  ${packageManager.execCommand} db migrate\n`);
    this.stdout.write("  # Optional if you want authentication enabled:\n");
    this.stdout.write(
      `  ${packageManager.execCommand} user create --email you@example.com --password 'your-password'\n`,
    );
    this.stdout.write(`  ${packageManager.runDevCommand}\n\n`);
  }

  private async installDependencies(targetDirectory: string): Promise<void> {
    const packageManager = this.resolvePackageManagerFromTargetDirectory(targetDirectory);
    this.stdout.write(`\nInstalling dependencies (${packageManager.installCommand})…\n`);
    await this.processRunner.run(packageManager.command, packageManager.installArgs, { cwd: targetDirectory });
  }

  private async runDatabaseMigrations(targetDirectory: string): Promise<void> {
    const packageManager = this.resolvePackageManagerFromTargetDirectory(targetDirectory);
    this.stdout.write("\nRunning database migrations…\n");
    await this.processRunner.run(packageManager.command, [...packageManager.execArgs, "db", "migrate"], {
      cwd: targetDirectory,
    });
  }

  private async createAdminUser(
    targetDirectory: string,
    authSetup: Readonly<{ email: string; password: string }>,
  ): Promise<void> {
    const packageManager = this.resolvePackageManagerFromTargetDirectory(targetDirectory);
    this.stdout.write("\nCreating admin user…\n");
    await this.processRunner.run(
      packageManager.command,
      [...packageManager.execArgs, "user", "create", "--email", authSetup.email, "--password", authSetup.password],
      {
        cwd: targetDirectory,
      },
    );
  }

  private async disableDevelopmentAuthBypass(targetDirectory: string): Promise<void> {
    const configPath = path.join(targetDirectory, "codemation.config.ts");
    let configSource: string;
    try {
      configSource = await this.fs.readFile(configPath, "utf8");
    } catch {
      return;
    }
    const updatedSource = configSource.replace(
      /allowUnauthenticatedInDevelopment:\s*true/,
      "allowUnauthenticatedInDevelopment: false",
    );
    if (updatedSource === configSource) {
      return;
    }
    await this.fs.writeFile(configPath, updatedSource);
  }

  private async ensureDefaultEnvFile(targetDirectory: string): Promise<void> {
    const envPath = path.join(targetDirectory, ".env");
    try {
      await this.fs.readFile(envPath, "utf8");
      return;
    } catch {
      // Fresh scaffold: copy .env.example when present.
    }
    const examplePath = path.join(targetDirectory, ".env.example");
    try {
      const envExample = await this.fs.readFile(examplePath, "utf8");
      await this.fs.writeFile(envPath, envExample);
    } catch {
      // Some templates may not provide .env.example.
    }
  }

  private resolvePackageManagerFromTargetDirectory(targetDirectory: string): Readonly<{
    command: string;
    installArgs: ReadonlyArray<string>;
    execArgs: ReadonlyArray<string>;
    installCommand: string;
    execCommand: string;
    runDevCommand: string;
  }> {
    const packageManagerField = this.readPackageManagerField(targetDirectory);
    if (packageManagerField?.startsWith("pnpm@")) {
      return {
        command: "pnpm",
        installArgs: ["install"],
        execArgs: ["exec", "codemation"],
        installCommand: "pnpm install",
        execCommand: "pnpm exec codemation",
        runDevCommand: "pnpm dev",
      };
    }
    return {
      command: "npm",
      installArgs: ["install"],
      execArgs: ["exec", "--", "codemation"],
      installCommand: "npm install",
      execCommand: "npm exec -- codemation",
      runDevCommand: "npm run dev",
    };
  }

  private readPackageManagerField(targetDirectory: string): string | null {
    const packageJsonPath = path.join(targetDirectory, "package.json");
    try {
      const raw = fs.readFileSync(packageJsonPath, "utf8");
      const parsed = JSON.parse(raw) as { packageManager?: unknown };
      return typeof parsed.packageManager === "string" ? parsed.packageManager : null;
    } catch {
      return null;
    }
  }
}
