import type { ConsumerBuildOptions, EcmaScriptBuildTarget } from "../consumer/consumerBuildOptions.types";

export class ConsumerBuildOptionsParser {
  parse(
    args: Readonly<{
      noSourceMaps?: boolean;
      target?: string;
    }>,
  ): ConsumerBuildOptions {
    return {
      sourceMaps: args.noSourceMaps !== true,
      target: this.parseTarget(args.target),
    };
  }

  private parseTarget(raw: string | undefined): EcmaScriptBuildTarget {
    if (raw === undefined || raw.trim() === "") {
      return "es2022";
    }
    const normalized = raw.trim();
    if (normalized === "es2020" || normalized === "es2022") {
      return normalized;
    }
    throw new Error(`Invalid --target "${raw}". Use es2020 or es2022.`);
  }
}
