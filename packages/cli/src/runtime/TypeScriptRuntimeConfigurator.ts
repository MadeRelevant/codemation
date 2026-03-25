import path from "node:path";
import process from "node:process";

export class TypeScriptRuntimeConfigurator {
  configure(repoRoot: string): void {
    process.env.CODEMATION_TSCONFIG_PATH = path.resolve(repoRoot, "tsconfig.base.json");
  }
}
