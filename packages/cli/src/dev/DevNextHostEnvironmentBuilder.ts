import path from "node:path";
import process from "node:process";

import { ConsumerEnvLoader } from "../consumer/ConsumerEnvLoader";
import { SourceMapNodeOptions } from "../runtime/SourceMapNodeOptions";

export class DevNextHostEnvironmentBuilder {
  constructor(
    private readonly consumerEnvLoader: ConsumerEnvLoader,
    private readonly sourceMapNodeOptions: SourceMapNodeOptions,
  ) {}

  buildConsumerUiProxy(
    args: Readonly<{
      authSecret: string;
      configPathOverride?: string;
      consumerOutputManifestPath?: string;
      consumerRoot: string;
      developmentServerToken: string;
      nextPort: number;
      publicBaseUrl: string;
      runtimeDevUrl: string;
      skipUiAuth: boolean;
      websocketPort: number;
    }>,
  ): NodeJS.ProcessEnv {
    const publicWebsocketPort = this.resolvePublicWebsocketPort(args.publicBaseUrl, args.websocketPort);
    return {
      ...this.build({
        authSecret: args.authSecret,
        configPathOverride: args.configPathOverride,
        consumerOutputManifestPath: args.consumerOutputManifestPath,
        consumerRoot: args.consumerRoot,
        developmentServerToken: args.developmentServerToken,
        nextPort: args.nextPort,
        runtimeDevUrl: args.runtimeDevUrl,
        skipUiAuth: args.skipUiAuth,
        websocketPort: args.websocketPort,
      }),
      // Standalone `server.js` uses `process.env.HOSTNAME || '0.0.0.0'` for bind; Docker sets HOSTNAME to the
      // container id, which breaks loopback health checks — force IPv4 loopback for the UI child only.
      HOSTNAME: "127.0.0.1",
      AUTH_SECRET: args.authSecret,
      AUTH_URL: args.publicBaseUrl,
      CODEMATION_PUBLIC_BASE_URL: args.publicBaseUrl,
      CODEMATION_PUBLIC_WS_PORT: String(publicWebsocketPort),
      NEXT_PUBLIC_CODEMATION_WS_PORT: String(publicWebsocketPort),
    };
  }

  build(
    args: Readonly<{
      authSecret?: string;
      configPathOverride?: string;
      consumerOutputManifestPath?: string;
      consumerRoot: string;
      developmentServerToken: string;
      nextPort: number;
      skipUiAuth: boolean;
      websocketPort: number;
      runtimeDevUrl?: string;
    }>,
  ): NodeJS.ProcessEnv {
    const merged = this.consumerEnvLoader.mergeConsumerRootIntoProcessEnvironment(args.consumerRoot, process.env);
    const consumerOutputManifestPath =
      args.consumerOutputManifestPath ?? path.resolve(args.consumerRoot, ".codemation", "output", "current.json");
    return {
      ...merged,
      PORT: String(args.nextPort),
      CODEMATION_CONSUMER_ROOT: args.consumerRoot,
      CODEMATION_CONSUMER_OUTPUT_MANIFEST_PATH: consumerOutputManifestPath,
      CODEMATION_UI_AUTH_ENABLED: String(!args.skipUiAuth),
      CODEMATION_PUBLIC_WS_PORT: String(args.websocketPort),
      CODEMATION_WS_PORT: String(args.websocketPort),
      NEXT_PUBLIC_CODEMATION_WS_PORT: String(args.websocketPort),
      CODEMATION_DEV_SERVER_TOKEN: args.developmentServerToken,
      CODEMATION_SKIP_STARTUP_MIGRATIONS: "true",
      NODE_OPTIONS: this.sourceMapNodeOptions.appendToNodeOptions(process.env.NODE_OPTIONS),
      WS_NO_BUFFER_UTIL: "1",
      WS_NO_UTF_8_VALIDATE: "1",
      ...(args.authSecret && args.authSecret.trim().length > 0 ? { AUTH_SECRET: args.authSecret.trim() } : {}),
      ...(args.configPathOverride && args.configPathOverride.trim().length > 0
        ? { CODEMATION_CONFIG_PATH: args.configPathOverride }
        : {}),
      ...(args.runtimeDevUrl !== undefined && args.runtimeDevUrl.trim().length > 0
        ? { CODEMATION_RUNTIME_DEV_URL: args.runtimeDevUrl.trim() }
        : {}),
    };
  }

  private resolvePublicWebsocketPort(publicBaseUrl: string, fallbackPort: number): number {
    try {
      const parsedUrl = new URL(publicBaseUrl);
      const parsedPort = Number(parsedUrl.port);
      if (Number.isInteger(parsedPort) && parsedPort > 0) {
        return parsedPort;
      }
    } catch {
      // Fall back to the runtime websocket port when the public URL is malformed.
    }
    return fallbackPort;
  }
}
