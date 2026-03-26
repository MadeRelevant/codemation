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

  async runAfterScaffold(args: Readonly<{ targetDirectory: string; noInteraction: boolean }>): Promise<void> {
    const noInteraction = args.noInteraction || !this.stdinIsTTY;
    if (!args.noInteraction && !this.stdinIsTTY) {
      this.stdout.write(
        "\nNote: stdin is not a TTY; skipping interactive onboarding. Use --no-interaction to hide this message next time.\n",
      );
    }
    if (noInteraction) {
      this.printManualSteps(args.targetDirectory);
      return;
    }
    const proceed = await this.prompts.confirm(
      "\nSet up PostgreSQL and create your first admin user now? (requires npm install and a reachable database)",
    );
    if (!proceed) {
      this.printManualSteps(args.targetDirectory);
      return;
    }
    const databaseUrl = await this.prompts.question(
      "PostgreSQL DATABASE_URL (e.g. postgresql://user:pass@127.0.0.1:5432/codemation): ",
    );
    if (databaseUrl.length === 0) {
      this.stdout.write("No DATABASE_URL provided; skipping automated setup.\n");
      this.printManualSteps(args.targetDirectory);
      return;
    }
    const email = await this.prompts.question("Admin email: ");
    if (!this.isValidEmail(email)) {
      this.stdout.write("That does not look like a valid email; skipping automated setup.\n");
      this.printManualSteps(args.targetDirectory);
      return;
    }
    const password = await this.prompts.question("Admin password (min 8 characters; shown as you type): ");
    const passwordAgain = await this.prompts.question("Repeat password: ");
    if (password.length < 8 || password !== passwordAgain) {
      this.stdout.write("Passwords must match and be at least 8 characters; skipping automated setup.\n");
      this.printManualSteps(args.targetDirectory);
      return;
    }
    const envPath = path.join(args.targetDirectory, ".env");
    const examplePath = path.join(args.targetDirectory, ".env.example");
    let envBody: string;
    try {
      envBody = await this.fs.readFile(examplePath, "utf8");
    } catch {
      envBody = "";
    }
    const merged = this.mergeDatabaseUrlIntoEnv(envBody, databaseUrl);
    await this.fs.writeFile(envPath, merged);
    this.stdout.write("\nInstalling dependencies (npm install)…\n");
    await this.processRunner.run("npm", ["install"], { cwd: args.targetDirectory });
    this.stdout.write("\nRunning database migrations…\n");
    await this.processRunner.run("npm", ["exec", "codemation", "--", "db", "migrate"], {
      cwd: args.targetDirectory,
    });
    this.stdout.write("\nCreating admin user…\n");
    await this.processRunner.run(
      "npm",
      ["exec", "codemation", "--", "user", "create", "--email", email, "--password", password],
      {
        cwd: args.targetDirectory,
      },
    );
    this.stdout.write("\nDone. Start the app with:\n");
    this.stdout.write(`  cd ${path.basename(args.targetDirectory)}\n`);
    this.stdout.write("  npm run dev\n\n");
  }

  private mergeDatabaseUrlIntoEnv(envExampleBody: string, databaseUrl: string): string {
    const lines = envExampleBody.split(/\r?\n/);
    const out: string[] = [];
    let replaced = false;
    for (const line of lines) {
      if (line.startsWith("DATABASE_URL=")) {
        out.push(`DATABASE_URL=${databaseUrl}`);
        replaced = true;
      } else {
        out.push(line);
      }
    }
    if (!replaced) {
      out.unshift(`DATABASE_URL=${databaseUrl}`);
    }
    return `${out.join("\n").replace(/\n+$/, "")}\n`;
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  private printManualSteps(targetDirectory: string): void {
    const name = path.basename(targetDirectory);
    this.stdout.write(`\nNext steps for ${name}:\n`);
    this.stdout.write(`  cd ${name}\n`);
    this.stdout.write("  cp .env.example .env   # edit DATABASE_URL (PostgreSQL)\n");
    this.stdout.write("  npm install\n");
    this.stdout.write("  npm exec codemation -- db migrate\n");
    this.stdout.write("  npm exec codemation -- user create --email you@example.com --password 'your-password'\n");
    this.stdout.write("  npm run dev\n\n");
  }
}
