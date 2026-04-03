import { writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { ReleaseTagVersionResolver } from "./ReleaseTagVersionResolver.mjs";

class ReleaseTagVersionCli {
  constructor(runtimeProcess) {
    this.runtimeProcess = runtimeProcess;
  }

  async run() {
    const options = this.#readOptions();
    const resolver = new ReleaseTagVersionResolver({
      rootDirectory: options.rootDirectory,
    });
    const version = await resolver.resolve();

    await writeFile(options.outputPath, `${version}\n`, "utf8");
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

    const outputPath = this.#requireOption(options, "output");
    const rootDirectory = path.resolve(this.runtimeProcess.cwd(), options.get("root") ?? ".");

    return {
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

await new ReleaseTagVersionCli(process).run();
