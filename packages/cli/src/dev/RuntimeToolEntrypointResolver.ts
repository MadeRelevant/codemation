import { access } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";

export type ResolvedRuntimeToolEntrypoint = Readonly<{
  args: ReadonlyArray<string>;
  command: string;
  env: Readonly<Record<string, string>>;
}>;

export class RuntimeToolEntrypointResolver {
  private readonly require = createRequire(import.meta.url);

  async resolve(
    args: Readonly<{
      packageName: string;
      repoRoot: string;
      sourceEntrypoint: string;
    }>,
  ): Promise<ResolvedRuntimeToolEntrypoint> {
    const sourceEntrypointPath = path.resolve(args.repoRoot, args.sourceEntrypoint);
    if (await this.exists(sourceEntrypointPath)) {
      return {
        command: process.execPath,
        args: ["--import", "tsx", sourceEntrypointPath],
        env: {
          TSX_TSCONFIG_PATH: path.resolve(args.repoRoot, "tsconfig.codemation-tsx.json"),
        },
      };
    }
    return {
      command: process.execPath,
      args: [this.require.resolve(args.packageName)],
      env: {},
    };
  }

  private async exists(filePath: string): Promise<boolean> {
    try {
      await access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
