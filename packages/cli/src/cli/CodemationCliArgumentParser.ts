import type { CodemationCliCommandName, CodemationCliParsedCommand } from "./types";

export class CodemationCliArgumentParser {
  parse(argv: ReadonlyArray<string>): CodemationCliParsedCommand {
    const [rawCommand, ...rest] = argv;
    const name = this.parseCommandName(rawCommand);
    return {
      name,
      options: this.parseOptions(rest),
    };
  }

  getHelpText(): string {
    return [
      "Usage: codemation <command> [options]",
      "",
      "Commands:",
      "  dev      Start the framework UI plus discovered host runtime",
      "  host     Start only the discovered host runtime",
      "  worker   Start only the discovered worker runtime",
      "",
      "Options:",
      "  --consumer-root <path>   Consumer app root (defaults to current directory)",
      "  --workspace-root <path>  Workspace root for in-repo framework development",
      "  --repo-root <path>       Alias for --workspace-root",
      "  --help                   Show this help text",
    ].join("\n");
  }

  private parseCommandName(rawCommand: string | undefined): CodemationCliCommandName {
    if (!rawCommand || rawCommand === "--help" || rawCommand === "-h") return "help";
    if (rawCommand === "dev" || rawCommand === "host" || rawCommand === "worker") return rawCommand;
    const error = Error(`Unknown codemation command: ${rawCommand}`);
    error.name = "CodemationCliError";
    throw error;
  }

  private parseOptions(argv: ReadonlyArray<string>): ReadonlyMap<string, string | true> {
    const options = new Map<string, string | true>();
    for (let index = 0; index < argv.length; index++) {
      const entry = argv[index];
      if (!entry?.startsWith("--")) continue;
      const option = entry.slice(2);
      const [name, inlineValue] = option.split("=", 2);
      if (!name) continue;
      if (inlineValue !== undefined) {
        options.set(name, inlineValue);
        continue;
      }
      const nextEntry = argv[index + 1];
      if (!nextEntry || nextEntry.startsWith("--")) {
        options.set(name, true);
        continue;
      }
      options.set(name, nextEntry);
      index += 1;
    }
    return options;
  }
}
