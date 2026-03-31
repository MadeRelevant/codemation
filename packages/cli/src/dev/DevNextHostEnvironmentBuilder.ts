import path from "node:path";
import process from "node:process";
import type { CodemationAuthConfig } from "@codemation/host";
import { CodemationFrontendAuthSnapshotFactory, FrontendAppConfigJsonCodec } from "@codemation/host";

import { ConsumerEnvLoader } from "../consumer/ConsumerEnvLoader";
import { SourceMapNodeOptions } from "../runtime/SourceMapNodeOptions";

export class DevNextHostEnvironmentBuilder {
  constructor(
    private readonly consumerEnvLoader: ConsumerEnvLoader,
    private readonly sourceMapNodeOptions: SourceMapNodeOptions,
    private readonly frontendAuthSnapshotFactory: CodemationFrontendAuthSnapshotFactory = new CodemationFrontendAuthSnapshotFactory(),
    private readonly frontendAppConfigJsonCodec: FrontendAppConfigJsonCodec = new FrontendAppConfigJsonCodec(),
  ) {}

  buildConsumerUiProxy(
    args: Readonly<{
      authConfigJson: string;
      authSecret: string;
      consumerRoot: string;
      developmentServerToken: string;
      nextPort: number;
      publicBaseUrl: string;
      runtimeDevUrl: string;
      skipUiAuth: boolean;
      websocketPort: number;
      consumerOutputManifestPath?: string;
    }>,
  ): NodeJS.ProcessEnv {
    return {
      ...this.build({
        authConfigJson: args.authConfigJson,
        authSecret: args.authSecret,
        consumerRoot: args.consumerRoot,
        developmentServerToken: args.developmentServerToken,
        nextPort: args.nextPort,
        runtimeDevUrl: args.runtimeDevUrl,
        skipUiAuth: args.skipUiAuth,
        websocketPort: args.websocketPort,
        consumerOutputManifestPath: args.consumerOutputManifestPath,
      }),
      // Standalone `server.js` uses `process.env.HOSTNAME || '0.0.0.0'` for bind; Docker sets HOSTNAME to the
      // container id, which breaks loopback health checks — force IPv4 loopback for the UI child only.
      HOSTNAME: "127.0.0.1",
      AUTH_SECRET: args.authSecret,
      AUTH_URL: args.publicBaseUrl,
    };
  }

  build(
    args: Readonly<{
      authConfigJson: string;
      authSecret?: string;
      consumerRoot: string;
      developmentServerToken: string;
      nextPort: number;
      skipUiAuth: boolean;
      websocketPort: number;
      runtimeDevUrl?: string;
      /** Same manifest as `codemation build` / serve-web so @codemation/next-host can load consumer config (whitelabel, etc.). */
      consumerOutputManifestPath?: string;
    }>,
  ): NodeJS.ProcessEnv {
    const merged = this.consumerEnvLoader.mergeConsumerRootIntoProcessEnvironment(args.consumerRoot, process.env);
    const manifestPath =
      args.consumerOutputManifestPath ?? path.resolve(args.consumerRoot, ".codemation", "output", "current.json");
    const authSecret = args.authSecret ?? merged.AUTH_SECRET;
    const authSnapshot = this.frontendAuthSnapshotFactory.createFromResolvedInputs({
      authConfig: this.parseAuthConfig(args.authConfigJson),
      env: {
        ...merged,
        ...(typeof authSecret === "string" && authSecret.trim().length > 0
          ? {
              AUTH_SECRET: authSecret,
            }
          : {}),
      },
      uiAuthEnabled: !args.skipUiAuth,
    });
    return {
      ...merged,
      PORT: String(args.nextPort),
      CODEMATION_CONSUMER_ROOT: args.consumerRoot,
      CODEMATION_CONSUMER_OUTPUT_MANIFEST_PATH: manifestPath,
      CODEMATION_FRONTEND_APP_CONFIG_JSON: this.frontendAppConfigJsonCodec.serialize({
        auth: authSnapshot,
        productName: "Codemation",
        logoUrl: null,
      }),
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

  private parseAuthConfig(authConfigJson: string): CodemationAuthConfig | undefined {
    if (authConfigJson.trim().length === 0) {
      return undefined;
    }
    const parsed = JSON.parse(authConfigJson) as CodemationAuthConfig | null;
    return parsed ?? undefined;
  }
}
