import { CodemationPluginDiscovery } from "@codemation/host/server";
import { logLevelPolicyFactory, ServerLoggerFactory } from "@codemation/host/next/server";
import { Command } from "commander";
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { ConsumerBuildArtifactsPublisher } from "./build/ConsumerBuildArtifactsPublisher";
import { ConsumerBuildOptionsParser } from "./build/ConsumerBuildOptionsParser";
import { BuildCommand } from "./commands/BuildCommand";
import { DevCommand } from "./commands/DevCommand";
import { ServeWebCommand } from "./commands/ServeWebCommand";
import { ServeWorkerCommand } from "./commands/ServeWorkerCommand";
import { UserCreateCommand } from "./commands/UserCreateCommand";
import { ConsumerEnvLoader } from "./consumer/ConsumerEnvLoader";
import { ConsumerOutputBuilderLoader } from "./consumer/Loader";
import { DevSessionServicesBuilder } from "./dev/Builder";
import { DevLockFactory } from "./dev/Factory";
import { DevSourceWatcherFactory } from "./dev/Runner";
import { CliPathResolver } from "./path/CliPathResolver";
import { ListenPortResolver } from "./runtime/ListenPortResolver";
import { SourceMapNodeOptions } from "./runtime/SourceMapNodeOptions";
import { TypeScriptRuntimeConfigurator } from "./runtime/TypeScriptRuntimeConfigurator";
import { LocalUserCreator } from "./user/LocalUserCreator";

const loggerFactory = new ServerLoggerFactory(logLevelPolicyFactory);

export class CliProgram {
  private readonly buildOptionsParser = new ConsumerBuildOptionsParser();

  constructor(
    private readonly buildCommand: BuildCommand = new BuildCommand(
      loggerFactory.create("codemation-cli"),
      new CliPathResolver(),
      new CodemationPluginDiscovery(),
      new ConsumerBuildArtifactsPublisher(),
      new TypeScriptRuntimeConfigurator(),
      new ConsumerOutputBuilderLoader(),
    ),
    private readonly devCommand: DevCommand = new DevCommand(
      new CliPathResolver(),
      new CodemationPluginDiscovery(),
      new TypeScriptRuntimeConfigurator(),
      new DevLockFactory(),
      new DevSourceWatcherFactory(),
      loggerFactory.create("codemation-cli"),
      new DevSessionServicesBuilder(loggerFactory).build(),
    ),
    private readonly serveWebCommand: ServeWebCommand = new ServeWebCommand(
      new CliPathResolver(),
      new CodemationPluginDiscovery(),
      new ConsumerBuildArtifactsPublisher(),
      new TypeScriptRuntimeConfigurator(),
      new SourceMapNodeOptions(),
      new ConsumerOutputBuilderLoader(),
      new ConsumerEnvLoader(),
      new ListenPortResolver(),
    ),
    private readonly serveWorkerCommand: ServeWorkerCommand = new ServeWorkerCommand(new SourceMapNodeOptions()),
    private readonly userCreateCommand: UserCreateCommand = new UserCreateCommand(new LocalUserCreator()),
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
        "Start the dev gateway and runtime child. Use CODEMATION_DEV_MODE=framework with Next dev for framework UI HMR; default consumer mode serves API/WebSocket from the gateway only.",
      )
      .option("--consumer-root <path>", "Path to the consumer project root (defaults to cwd)")
      .action(async (opts: Readonly<{ consumerRoot?: string }>) => {
        await this.devCommand.execute(resolveConsumerRoot(opts.consumerRoot));
      });

    const serve = program.command("serve").description("Run production web or worker processes (no dev watchers).");

    serve
      .command("web")
      .description("Start the built Next.js Codemation host (next start).")
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
