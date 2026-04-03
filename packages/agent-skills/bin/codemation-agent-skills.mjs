#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { cp, mkdir, readdir, rm, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export class CommandError extends Error {}

export class FileSystemGateway {
  async copyDirectory(sourcePath, destinationPath) {
    await cp(sourcePath, destinationPath, { force: true, recursive: true });
  }

  async createDirectory(targetPath) {
    await mkdir(targetPath, { recursive: true });
  }

  async listDirectoryEntries(targetPath) {
    return readdir(targetPath, { withFileTypes: true });
  }

  async removePath(targetPath) {
    await rm(targetPath, { force: true, recursive: true });
  }

  async statPath(targetPath) {
    return stat(targetPath);
  }
}

export class SkillExtractor {
  constructor(fileSystem, packageRoot, cwd, stdout) {
    this.fileSystem = fileSystem;
    this.packageRoot = packageRoot;
    this.cwd = cwd;
    this.stdout = stdout;
  }

  async extract(outputArgument) {
    const outputPath = path.resolve(this.cwd, outputArgument);
    const skillsRoot = path.join(this.packageRoot, "skills");

    await this.fileSystem.createDirectory(outputPath);
    const packagedEntries = await this.fileSystem.listDirectoryEntries(skillsRoot);
    const packagedSkillNames = new Set(
      packagedEntries.filter((entry) => entry.isDirectory()).map((entry) => entry.name),
    );

    await this.#removeStaleSkillDirectories(outputPath, packagedSkillNames);

    for (const skillName of packagedSkillNames) {
      const sourcePath = path.join(skillsRoot, skillName);
      const destinationPath = path.join(outputPath, skillName);
      await this.fileSystem.removePath(destinationPath);
      await this.fileSystem.copyDirectory(sourcePath, destinationPath);
      this.stdout.write(`[codemation-agent-skills] extracted ${skillName}\n`);
    }
  }

  async #removeStaleSkillDirectories(outputPath, packagedSkillNames) {
    let existingEntries;
    try {
      existingEntries = await this.fileSystem.listDirectoryEntries(outputPath);
    } catch {
      return;
    }

    for (const entry of existingEntries) {
      if (!entry.isDirectory()) {
        continue;
      }
      if (!entry.name.startsWith("codemation-")) {
        continue;
      }
      if (packagedSkillNames.has(entry.name)) {
        continue;
      }
      await this.fileSystem.removePath(path.join(outputPath, entry.name));
    }
  }
}

export class CommandLineParser {
  constructor(argv) {
    this.argv = argv;
  }

  parse() {
    const [command, ...rest] = this.argv;
    if (!command || command === "--help" || command === "-h") {
      return { command: "help" };
    }
    if (command !== "extract") {
      throw new CommandError(`Unknown command "${command}".`);
    }

    let output = ".agents/skills/extracted";
    for (let index = 0; index < rest.length; index += 1) {
      const argument = rest[index];
      if (argument === "--output") {
        const value = rest[index + 1];
        if (!value) {
          throw new CommandError("Missing value for --output.");
        }
        output = value;
        index += 1;
        continue;
      }
      if (argument === "--help" || argument === "-h") {
        return { command: "help" };
      }
      throw new CommandError(`Unknown argument "${argument}".`);
    }

    return { command: "extract", output };
  }
}

export class CodemationAgentSkillsCli {
  constructor(argv, cwd, stdout, stderr) {
    this.argv = argv;
    this.cwd = cwd;
    this.stdout = stdout;
    this.stderr = stderr;
    this.fileSystem = new FileSystemGateway();
  }

  async run() {
    try {
      const parsed = new CommandLineParser(this.argv).parse();
      if (parsed.command === "help") {
        this.#writeHelp();
        return;
      }

      const packageRoot = path.resolve(import.meta.dirname, "..");
      const extractor = new SkillExtractor(this.fileSystem, packageRoot, this.cwd, this.stdout);
      await extractor.extract(parsed.output);
    } catch (error) {
      if (error instanceof CommandError) {
        this.stderr.write(`${error.message}\n\n`);
        this.#writeHelp();
        process.exitCode = 1;
        return;
      }
      this.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    }
  }

  #writeHelp() {
    this.stdout.write(
      [
        "codemation-agent-skills",
        "",
        "Usage:",
        "  codemation-agent-skills extract [--output <path>]",
        "",
        "Commands:",
        "  extract    Copy packaged Codemation skills into a project directory.",
        "",
        "Options:",
        "  --output   Destination directory. Defaults to .agents/skills/extracted.",
        "",
      ].join("\n"),
    );
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await new CodemationAgentSkillsCli(process.argv.slice(2), process.cwd(), process.stdout, process.stderr).run();
}
