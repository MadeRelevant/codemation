import net from "node:net";
import Fastify, { type FastifyInstance } from "fastify";
import type { CodemationBinding } from "../../../src/presentation/config/CodemationBinding";
import type { CodemationConfig } from "../../../src/presentation/config/CodemationConfig";
import { CodemationServerGateway } from "../../../src/presentation/http/CodemationServerGateway";
import { FastifyApiRouteRegistrar } from "../../../src/presentation/server/FastifyApiRouteRegistrar";

export interface FrontendHttpIntegrationHarnessOptions {
  readonly config: CodemationConfig;
  readonly consumerRoot: string;
  readonly configSource?: string;
  readonly workflowSources?: ReadonlyArray<string>;
  readonly env?: Readonly<NodeJS.ProcessEnv>;
  readonly bindings?: ReadonlyArray<CodemationBinding<unknown>>;
}

export interface FrontendHttpIntegrationRequest {
  readonly method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  readonly url: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly payload?: string;
}

interface FrontendHttpInjectedResponse {
  readonly statusCode: number;
  readonly body: string;
  readonly headers: Readonly<Record<string, string | string[] | number | undefined>>;
}

export class FrontendHttpIntegrationResponse {
  constructor(private readonly response: FrontendHttpInjectedResponse) {}

  get statusCode(): number {
    return this.response.statusCode;
  }

  get body(): string {
    return this.response.body;
  }

  header(name: string): string | string[] | number | undefined {
    return this.response.headers[name];
  }

  json<TValue>(): TValue {
    return JSON.parse(this.response.body) as TValue;
  }
}

export class FrontendHttpIntegrationHarness {
  private readonly apiRouteRegistrar = new FastifyApiRouteRegistrar();

  private application: FastifyInstance | null = null;
  private gateway: CodemationServerGateway | null = null;

  constructor(private readonly options: FrontendHttpIntegrationHarnessOptions) {}

  async start(): Promise<void> {
    const websocketPort = await new FrontendIntegrationPortAllocator().allocate();
    this.gateway = new CodemationServerGateway(
      this.createEffectiveConfig(),
      this.options.consumerRoot,
      this.options.configSource,
      this.options.workflowSources ?? [],
      {
        ...this.options.env,
        CODEMATION_WS_PORT: String(websocketPort),
      },
    );
    await this.gateway.prepare();
    const application = Fastify({
      logger: false,
    });
    await this.apiRouteRegistrar.register(application, this.gateway);
    this.application = application;
  }

  async close(): Promise<void> {
    if (this.application) {
      await this.application.close();
      this.application = null;
    }
    if (this.gateway) {
      await this.gateway.close();
      this.gateway = null;
    }
  }

  async request(args: FrontendHttpIntegrationRequest): Promise<FrontendHttpIntegrationResponse> {
    const application = this.requireApplication();
    return new FrontendHttpIntegrationResponse((await application.inject(args as never)) as FrontendHttpInjectedResponse);
  }

  async requestJson<TValue>(
    args: Readonly<Omit<FrontendHttpIntegrationRequest, "payload" | "headers"> & { headers?: Readonly<Record<string, string>>; payload?: unknown }>,
  ): Promise<TValue> {
    const response = await this.request({
      ...args,
      headers: {
        "content-type": "application/json",
        ...(args.headers ?? {}),
      },
      payload: args.payload === undefined ? undefined : JSON.stringify(args.payload),
    });
    return response.json<TValue>();
  }

  private createEffectiveConfig(): CodemationConfig {
    if (!this.options.bindings || this.options.bindings.length === 0) {
      return this.options.config;
    }
    return {
      ...this.options.config,
      bindings: [...(this.options.config.bindings ?? []), ...this.options.bindings],
    };
  }

  private requireApplication(): FastifyInstance {
    if (!this.application) {
      throw new Error("FrontendHttpIntegrationHarness.start() must be called before issuing requests.");
    }
    return this.application;
  }
}

class FrontendIntegrationPortAllocator {
  async allocate(): Promise<number> {
    return await new Promise<number>((resolve, reject) => {
      const server = net.createServer();
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        if (!address || typeof address === "string") {
          server.close((error) => reject(error ?? new Error("Unable to allocate an ephemeral websocket port.")));
          return;
        }
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve(address.port);
        });
      });
    });
  }
}
