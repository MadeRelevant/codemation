import process from "node:process";

import { ConsumerEnvLoader } from "../consumer/ConsumerEnvLoader";
import { SourceMapNodeOptions } from "../runtime/SourceMapNodeOptions";

export class DevNextHostEnvironmentBuilder {
  constructor(
    private readonly consumerEnvLoader: ConsumerEnvLoader,
    private readonly sourceMapNodeOptions: SourceMapNodeOptions,
  ) {}

  build(
    args: Readonly<{
      authConfigJson: string;
      consumerRoot: string;
      developmentServerToken: string;
      nextPort: number;
      skipUiAuth: boolean;
      websocketPort: number;
      runtimeDevUrl?: string;
    }>,
  ): NodeJS.ProcessEnv {
    const merged = this.consumerEnvLoader.mergeConsumerRootIntoProcessEnvironment(args.consumerRoot, process.env);
    return {
      ...merged,
      PORT: String(args.nextPort),
      CODEMATION_AUTH_CONFIG_JSON: args.authConfigJson,
      CODEMATION_CONSUMER_ROOT: args.consumerRoot,
      CODEMATION_SKIP_UI_AUTH: args.skipUiAuth ? "true" : "false",
      NEXT_PUBLIC_CODEMATION_SKIP_UI_AUTH: args.skipUiAuth ? "true" : "false",
      CODEMATION_WS_PORT: String(args.websocketPort),
      NEXT_PUBLIC_CODEMATION_WS_PORT: String(args.websocketPort),
      CODEMATION_DEV_SERVER_TOKEN: args.developmentServerToken,
      CODEMATION_SKIP_STARTUP_MIGRATIONS: "true",
      NODE_OPTIONS: this.sourceMapNodeOptions.appendToNodeOptions(process.env.NODE_OPTIONS),
      WS_NO_BUFFER_UTIL: "1",
      WS_NO_UTF_8_VALIDATE: "1",
      ...(args.runtimeDevUrl !== undefined && args.runtimeDevUrl.trim().length > 0
        ? { CODEMATION_RUNTIME_DEV_URL: args.runtimeDevUrl.trim() }
        : {}),
    };
  }
}
