import { Command } from "commander";
import path from "node:path";
import process from "node:process";

import type { ConsumerProjectScaffolder } from "./ConsumerProjectScaffolder";
import type { PostScaffoldOnboardingPort } from "./PostScaffoldOnboardingPort";
import type { TemplateCatalog } from "./TemplateCatalog";
import type { TextOutputPort } from "./TextOutputPort";

export class CreateCodemationProgram {
  constructor(
    private readonly scaffolder: ConsumerProjectScaffolder,
    private readonly templateCatalog: TemplateCatalog,
    private readonly stdout: TextOutputPort,
    private readonly onboarding: PostScaffoldOnboardingPort,
  ) {}

  async run(argv: ReadonlyArray<string>): Promise<void> {
    const argvNoInteraction = argv.includes("--no-interaction");
    const argvForParse = argv.filter((a) => a !== "--no-interaction");
    const program = new Command();
    program.name("create-codemation");
    program.description("Create a Codemation consumer application or plugin package");
    program.argument("[directory]", "Target directory (default: codemation-app)");
    program.option("-t, --template <id>", "Template id", "default");
    program.option("--force", "Allow writing into a non-empty directory", false);
    program.option("--list-templates", "Print available template ids and exit", false);
    program.option(
      "--non-interactive",
      "Skip prompts; print manual next steps unless --admin-email and --admin-password are provided",
      false,
    );
    program.option("-y, --yes", "Same as --non-interactive / --no-interaction", false);
    program.option("--admin-email <email>", "Automatically create the first admin user without prompts");
    program.option("--admin-password <password>", "Password for --admin-email (min 8 characters)");
    program.addHelpText(
      "after",
      "\nExamples:\n  npm create codemation@latest my-app -- --template default\n  npm create codemation@latest my-plugin -- --template plugin\n  npm create codemation@latest my-app -- --no-interaction\n  npm create codemation@latest my-app -- --yes --admin-email admin@example.com --admin-password 'supersecret'\n  pnpm create codemation my-app --template minimal -- --non-interactive\n",
    );
    program.showHelpAfterError(true);
    await program.parseAsync(argvForParse, { from: "user" });
    const opts = program.opts<{
      template: string;
      force: boolean;
      listTemplates: boolean;
      nonInteractive: boolean;
      yes: boolean;
      adminEmail?: string;
      adminPassword?: string;
    }>();
    const directoryArg =
      typeof program.args[0] === "string" && program.args[0].length > 0 ? program.args[0] : "codemation-app";
    if (opts.listTemplates) {
      const ids = await this.templateCatalog.listTemplateIds();
      this.stdout.write(`${ids.join("\n")}\n`);
      return;
    }
    const targetDirectory = path.resolve(process.cwd(), directoryArg);
    await this.scaffolder.scaffold({
      templateId: opts.template,
      targetDirectory,
      force: opts.force,
    });
    const noInteraction = argvNoInteraction || opts.nonInteractive || opts.yes;
    await this.onboarding.runAfterScaffold({
      templateId: opts.template,
      targetDirectory,
      noInteraction,
      adminUser: this.resolveAdminUserOption(opts, program),
    });
  }

  private resolveAdminUserOption(
    opts: Readonly<{ adminEmail?: string; adminPassword?: string }>,
    program: Command,
  ): Readonly<{ email: string; password: string }> | undefined {
    const hasAdminEmail = typeof opts.adminEmail === "string" && opts.adminEmail.length > 0;
    const hasAdminPassword = typeof opts.adminPassword === "string" && opts.adminPassword.length > 0;
    if (hasAdminEmail !== hasAdminPassword) {
      program.error("Both --admin-email and --admin-password are required when either option is provided.");
    }
    if (!hasAdminEmail || !hasAdminPassword) {
      return undefined;
    }
    return {
      email: opts.adminEmail as string,
      password: opts.adminPassword as string,
    };
  }
}
