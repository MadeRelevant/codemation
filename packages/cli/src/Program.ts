import { Command } from "commander";
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { ConsumerBuildOptionsParser } from "./build/ConsumerBuildOptionsParser";
import { BuildCommand } from "./commands/BuildCommand";
import type { DbMigrateCommand } from "./commands/DbMigrateCommand";
import { DevCommand } from "./commands/DevCommand";
import { ServeWebCommand } from "./commands/ServeWebCommand";
import { ServeWorkerCommand } from "./commands/ServeWorkerCommand";
import { UserCreateCommand } from "./commands/UserCreateCommand";
import { UserListCommand } from "./commands/UserListCommand";

export class CliProgram {
  constructor(
    private readonly buildOptionsParser: ConsumerBuildOptionsParser,
    private readonly buildCommand: BuildCommand,
    private readonly devCommand: DevCommand,
    private readonly serveWebCommand: ServeWebCommand,
    private readonly serveWorkerCommand: ServeWorkerCommand,
    private readonly dbMigrateCommand: DbMigrateCommand,
    private readonly userCreateCommand: UserCreateCommand,
    private readonly userListCommand: UserListCommand,
  ) {}

  async run(argv: ReadonlyArray<string>): Promise<void> {
    const program = new Command();
    program
      .name("codemation")
      .description("Build and run the Codemation Next host against a consumer project.")
      .version(this.readCliPackageVersion(), "-V, --version", "Output CLI version")
      .showHelpAfterError("(add --help for usage)")
      .configureHelp({ sortSubcommands: true });

    const resolveConsumerRoot = (raw: string | undefined): string =>
      raw !== undefined && raw.trim().length > 0 ? path.resolve(process.cwd(), raw.trim()) : process.cwd();

    program
      .command("build")
      .description("Build consumer workflows/plugins output and write the manifest.")
      .option("--consumer-root <path>", "Path to the consumer project root (defaults to cwd)")
      .option(
        "--no-source-maps",
        "Disable .js.map files for emitted workflow modules (recommended for locked-down production bundles).",
      )
      .option(
        "--target <es2020|es2022>",
        "ECMAScript language version for emitted workflow JavaScript (default: es2022).",
        "es2022",
      )
      .action(async (opts: Readonly<{ consumerRoot?: string; noSourceMaps?: boolean; target?: string }>) => {
        await this.buildCommand.execute(resolveConsumerRoot(opts.consumerRoot), this.buildOptionsParser.parse(opts));
      });

    program
      .command("dev", { isDefault: true })
      .description(
        "Start the dev gateway and runtime child. Default consumer mode uses the packaged Codemation UI; use CODEMATION_DEV_MODE=framework for Next dev HMR when working on the host itself.",
      )
      .option("--consumer-root <path>", "Path to the consumer project root (defaults to cwd)")
      .action(async (opts: Readonly<{ consumerRoot?: string }>) => {
        await this.devCommand.execute(resolveConsumerRoot(opts.consumerRoot));
      });

    const serve = program.command("serve").description("Run production web or worker processes (no dev watchers).");

    serve
      .command("web")
      .description("Start the packaged Codemation web host.")
      .option("--consumer-root <path>", "Path to the consumer project root (defaults to cwd)")
      .option(
        "--no-source-maps",
        "Disable .js.map files for emitted workflow modules when this command runs the consumer build step.",
      )
      .option(
        "--target <es2020|es2022>",
        "ECMAScript language version for emitted workflow JavaScript when building consumer output (default: es2022).",
        "es2022",
      )
      .action(async (opts: Readonly<{ consumerRoot?: string; noSourceMaps?: boolean; target?: string }>) => {
        await this.serveWebCommand.execute(resolveConsumerRoot(opts.consumerRoot), this.buildOptionsParser.parse(opts));
      });

    serve
      .command("worker")
      .description("Start the Codemation worker process.")
      .option("--consumer-root <path>", "Path to the consumer project root (defaults to cwd)")
      .option("--config <path>", "Override path to codemation.config.ts / .js")
      .action(async (opts: Readonly<{ consumerRoot?: string; config?: string }>) => {
        await this.serveWorkerCommand.execute(resolveConsumerRoot(opts.consumerRoot), opts.config);
      });

    const db = program.command("db").description("Database utilities (PostgreSQL / Prisma).");

    db.command("migrate")
      .description(
        "Apply pending Prisma migrations using the consumer database URL (DATABASE_URL in `.env`, or CodemationConfig.runtime.database.url).",
      )
      .option("--consumer-root <path>", "Path to the consumer project root (defaults to cwd)")
      .option("--config <path>", "Override path to codemation.config.ts / .js")
      .action(async (opts: Readonly<{ consumerRoot?: string; config?: string }>) => {
        await this.dbMigrateCommand.execute({
          consumerRoot: resolveConsumerRoot(opts.consumerRoot),
          configPath: opts.config,
        });
      });

    const user = program.command("user").description("User administration (local auth)");

    user
      .command("create")
      .description(
        'Create or update a user in the database when CodemationConfig.auth.kind is "local". Uses DATABASE_URL or configured database URL.',
      )
      .requiredOption("--email <email>", "Login email")
      .requiredOption("--password <password>", "Plain password (stored as a bcrypt hash)")
      .option("--consumer-root <path>", "Path to the consumer project root (defaults to cwd)")
      .option("--config <path>", "Override path to codemation.config.ts / .js")
      .action(
        async (
          opts: Readonly<{
            email: string;
            password: string;
            consumerRoot?: string;
            config?: string;
          }>,
        ) => {
          await this.userCreateCommand.execute(opts);
        },
      );

    user
      .command("list")
      .description(
        'List users in the database when CodemationConfig.auth.kind is "local". Uses DATABASE_URL or configured database URL.',
      )
      .option("--consumer-root <path>", "Path to the consumer project root (defaults to cwd)")
      .option("--config <path>", "Override path to codemation.config.ts / .js")
      .action(async (opts: Readonly<{ consumerRoot?: string; config?: string }>) => {
        await this.userListCommand.execute(opts);
      });

    await program.parseAsync(argv as string[], { from: "user" });
  }

  private readCliPackageVersion(): string {
    try {
      const packageJsonPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "package.json");
      const parsed = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { version?: unknown };
      return typeof parsed.version === "string" ? parsed.version : "0.0.0";
    } catch {
      return "0.0.0";
    }
  }
}
