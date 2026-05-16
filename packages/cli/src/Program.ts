import { Command } from "commander";
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { ConsumerBuildOptionsParser } from "./build/ConsumerBuildOptionsParser";
import { BuildCommand } from "./commands/BuildCommand";
import type { CollectionsDeleteCommand } from "./commands/CollectionsDeleteCommand";
import type { CollectionsGetCommand } from "./commands/CollectionsGetCommand";
import type { CollectionsInsertCommand } from "./commands/CollectionsInsertCommand";
import type { CollectionsListCommand } from "./commands/CollectionsListCommand";
import type { CollectionsRowsCommand } from "./commands/CollectionsRowsCommand";
import type { CollectionsShowCommand } from "./commands/CollectionsShowCommand";
import type { CollectionsSyncCommand } from "./commands/CollectionsSyncCommand";
import type { CollectionsUpdateCommand } from "./commands/CollectionsUpdateCommand";
import type { DbMigrateCommand } from "./commands/DbMigrateCommand";
import { DevCommand } from "./commands/DevCommand";
import type { DevPluginCommand } from "./commands/DevPluginCommand";
import { ServeWebCommand } from "./commands/ServeWebCommand";
import { ServeWorkerCommand } from "./commands/ServeWorkerCommand";
import { SkillsSyncCommand } from "./commands/SkillsSyncCommand";
import { UserCreateCommand } from "./commands/UserCreateCommand";
import { UserListCommand } from "./commands/UserListCommand";

export class CliProgram {
  constructor(
    private readonly buildOptionsParser: ConsumerBuildOptionsParser,
    private readonly buildCommand: BuildCommand,
    private readonly devCommand: DevCommand,
    private readonly devPluginCommand: DevPluginCommand,
    private readonly serveWebCommand: ServeWebCommand,
    private readonly serveWorkerCommand: ServeWorkerCommand,
    private readonly skillsSyncCommand: SkillsSyncCommand,
    private readonly dbMigrateCommand: DbMigrateCommand,
    private readonly userCreateCommand: UserCreateCommand,
    private readonly userListCommand: UserListCommand,
    private readonly collectionsListCommand: CollectionsListCommand,
    private readonly collectionsShowCommand: CollectionsShowCommand,
    private readonly collectionsRowsCommand: CollectionsRowsCommand,
    private readonly collectionsGetCommand: CollectionsGetCommand,
    private readonly collectionsInsertCommand: CollectionsInsertCommand,
    private readonly collectionsUpdateCommand: CollectionsUpdateCommand,
    private readonly collectionsDeleteCommand: CollectionsDeleteCommand,
    private readonly collectionsSyncCommand: CollectionsSyncCommand,
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
        "Start the stable dev endpoint and disposable API runtime. Uses the packaged Codemation UI by default.",
      )
      .option("--consumer-root <path>", "Path to the consumer project root (defaults to cwd)")
      .option("--watch-framework", "Use Next dev HMR for framework UI work inside this repository.")
      .option(
        "--api-only",
        "Skip the workspace UI; useful when an external host (e.g. the control plane) serves the UI itself.",
      )
      .action(async (opts: Readonly<{ consumerRoot?: string; watchFramework?: boolean; apiOnly?: boolean }>) => {
        await this.devCommand.execute({
          consumerRoot: resolveConsumerRoot(opts.consumerRoot),
          watchFramework: opts.watchFramework === true,
          apiOnly: opts.apiOnly === true,
        });
      });

    program
      .command("dev:plugin")
      .description("Start plugin sandbox development using `codemation.plugin.ts`.")
      .option("--plugin-root <path>", "Path to the plugin project root (defaults to cwd)")
      .action(async (opts: Readonly<{ pluginRoot?: string }>) => {
        await this.devPluginCommand.execute({
          pluginRoot: resolveConsumerRoot(opts.pluginRoot),
        });
      });

    const skills = program.command("skills").description("Codemation packaged agent skills.");

    skills
      .command("sync")
      .description(
        "Refresh packaged skills under `.agents/skills/extracted` (framework-managed; overwrites packaged codemation-* skills).",
      )
      .option("--consumer-root <path>", "Path to the consumer or plugin project root (defaults to cwd)")
      .action(async (opts: Readonly<{ consumerRoot?: string }>) => {
        await this.skillsSyncCommand.execute(resolveConsumerRoot(opts.consumerRoot));
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

    const collections = program.command("collections").description("Data collections CRUD and schema sync.");

    collections
      .command("list")
      .description("List all registered collections.")
      .option("--consumer-root <path>", "Path to the consumer project root (defaults to cwd)")
      .option("--config <path>", "Override path to codemation.config.ts / .js")
      .option("--format <table|json>", "Output format (table or json)", "table")
      .action(async (opts: Readonly<{ consumerRoot?: string; config?: string; format?: "table" | "json" }>) => {
        await this.collectionsListCommand.execute(opts);
      });

    collections
      .command("show")
      .description("Show schema and index info for a collection.")
      .argument("<name>", "Collection name")
      .option("--consumer-root <path>", "Path to the consumer project root (defaults to cwd)")
      .option("--config <path>", "Override path to codemation.config.ts / .js")
      .option("--format <table|json>", "Output format (table or json)", "table")
      .action(
        async (name: string, opts: Readonly<{ consumerRoot?: string; config?: string; format?: "table" | "json" }>) => {
          await this.collectionsShowCommand.execute({ ...opts, name });
        },
      );

    collections
      .command("rows")
      .description("List rows in a collection.")
      .argument("<name>", "Collection name")
      .option("--consumer-root <path>", "Path to the consumer project root (defaults to cwd)")
      .option("--config <path>", "Override path to codemation.config.ts / .js")
      .option("--limit <n>", "Max rows to return (default: 20)")
      .option("--offset <n>", "Skip this many rows (default: 0)")
      .option(
        "--where <field=value>",
        "Filter by field value (repeatable)",
        (val, acc: string[]) => {
          acc.push(val);
          return acc;
        },
        [] as string[],
      )
      .option("--format <table|json>", "Output format (table or json)", "table")
      .action(
        async (
          name: string,
          opts: Readonly<{
            consumerRoot?: string;
            config?: string;
            limit?: string;
            offset?: string;
            where?: string[];
            format?: "table" | "json";
          }>,
        ) => {
          await this.collectionsRowsCommand.execute({ ...opts, name });
        },
      );

    collections
      .command("get")
      .description("Get a single row by ID.")
      .argument("<name>", "Collection name")
      .argument("<id>", "Row ID")
      .option("--consumer-root <path>", "Path to the consumer project root (defaults to cwd)")
      .option("--config <path>", "Override path to codemation.config.ts / .js")
      .option("--format <table|json>", "Output format (table or json)", "table")
      .action(
        async (
          name: string,
          id: string,
          opts: Readonly<{ consumerRoot?: string; config?: string; format?: "table" | "json" }>,
        ) => {
          await this.collectionsGetCommand.execute({ ...opts, name, id });
        },
      );

    collections
      .command("insert")
      .description("Insert a new row into a collection.")
      .argument("<name>", "Collection name")
      .option("--consumer-root <path>", "Path to the consumer project root (defaults to cwd)")
      .option("--config <path>", "Override path to codemation.config.ts / .js")
      .option("--data <json>", "Row data as a JSON string")
      .option(
        "--field <key=value>",
        "Set a field value (repeatable)",
        (val, acc: string[]) => {
          acc.push(val);
          return acc;
        },
        [] as string[],
      )
      .action(
        async (
          name: string,
          opts: Readonly<{
            consumerRoot?: string;
            config?: string;
            data?: string;
            field?: string[];
          }>,
        ) => {
          await this.collectionsInsertCommand.execute({ ...opts, name });
        },
      );

    collections
      .command("update")
      .description("Update an existing row by ID.")
      .argument("<name>", "Collection name")
      .argument("<id>", "Row ID")
      .option("--consumer-root <path>", "Path to the consumer project root (defaults to cwd)")
      .option("--config <path>", "Override path to codemation.config.ts / .js")
      .option("--patch <json>", "Partial update as a JSON string")
      .action(
        async (
          name: string,
          id: string,
          opts: Readonly<{ consumerRoot?: string; config?: string; patch?: string }>,
        ) => {
          await this.collectionsUpdateCommand.execute({ ...opts, name, id });
        },
      );

    collections
      .command("delete")
      .description("Delete a row by ID.")
      .argument("<name>", "Collection name")
      .argument("<id>", "Row ID")
      .option("--consumer-root <path>", "Path to the consumer project root (defaults to cwd)")
      .option("--config <path>", "Override path to codemation.config.ts / .js")
      .action(async (name: string, id: string, opts: Readonly<{ consumerRoot?: string; config?: string }>) => {
        await this.collectionsDeleteCommand.execute({ ...opts, name, id });
      });

    collections
      .command("sync")
      .description("Run collection schema sync (apply pending column/table changes).")
      .option("--consumer-root <path>", "Path to the consumer project root (defaults to cwd)")
      .option("--config <path>", "Override path to codemation.config.ts / .js")
      .option("--dry-run", "Print planned changes without applying them")
      .action(async (opts: Readonly<{ consumerRoot?: string; config?: string; dryRun?: boolean }>) => {
        await this.collectionsSyncCommand.execute(opts);
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
