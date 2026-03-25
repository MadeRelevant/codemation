import { Command } from "commander";
import path from "node:path";
import process from "node:process";

import type { ConsumerProjectScaffolder } from "./ConsumerProjectScaffolder";
import type { TemplateCatalog } from "./TemplateCatalog";
import type { TextOutputPort } from "./TextOutputPort";

export class CreateCodemationProgram {
  constructor(
    private readonly scaffolder: ConsumerProjectScaffolder,
    private readonly templateCatalog: TemplateCatalog,
    private readonly stdout: TextOutputPort,
  ) {}

  async run(argv: ReadonlyArray<string>): Promise<void> {
    const program = new Command();
    program.name("create-codemation");
    program.description("Create a Codemation consumer application");
    program.argument("[directory]", "Target directory (default: codemation-app)");
    program.option("-t, --template <id>", "Template id", "default");
    program.option("--force", "Allow writing into a non-empty directory", false);
    program.option("--list-templates", "Print available template ids and exit", false);
    program.addHelpText(
      "after",
      "\nExamples:\n  npm create codemation@latest my-app -- --template default\n  pnpm create codemation my-app --template minimal\n",
    );
    program.showHelpAfterError(true);
    await program.parseAsync(argv, { from: "user" });
    const opts = program.opts<{ template: string; force: boolean; listTemplates: boolean }>();
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
  }
}
