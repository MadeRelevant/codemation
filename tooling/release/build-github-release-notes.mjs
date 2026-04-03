import { writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { GitHubReleaseNotesBuilder } from "./GitHubReleaseNotesBuilder.mjs";

class GitHubReleaseNotesCli {
  constructor(runtimeProcess) {
    this.runtimeProcess = runtimeProcess;
  }

  async run() {
    const options = this.#readOptions();
    const builder = new GitHubReleaseNotesBuilder({
      rootDirectory: options.rootDirectory,
      repository: options.repository,
      version: options.version,
      tag: options.tag,
    });
    const releaseNotes = await builder.build();
    await writeFile(options.outputPath, releaseNotes, "utf8");
  }

  #readOptions() {
    const args = this.runtimeProcess.argv.slice(2);
    const options = new Map();

    for (let index = 0; index < args.length; index += 2) {
      const key = args[index];
      const value = args[index + 1];

      if (!key?.startsWith("--") || value === undefined) {
        throw new Error(`Invalid argument list: ${args.join(" ")}`);
      }

      options.set(key.slice(2), value);
    }

    const version = this.#requireOption(options, "version");
    const tag = this.#requireOption(options, "tag");
    const repository = this.#requireOption(options, "repository");
    const outputPath = this.#requireOption(options, "output");
    const rootDirectory = path.resolve(this.runtimeProcess.cwd(), options.get("root") ?? ".");

    return {
      version,
      tag,
      repository,
      outputPath,
      rootDirectory,
    };
  }

  #requireOption(options, name) {
    const value = options.get(name);

    if (!value) {
      throw new Error(`Missing required option --${name}`);
    }

    return value;
  }
}

await new GitHubReleaseNotesCli(process).run();
