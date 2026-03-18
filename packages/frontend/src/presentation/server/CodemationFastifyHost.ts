import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance } from "fastify";
import { CodemationServerGateway } from "../http/CodemationServerGateway";
import { CodemationConsumerConfigLoader } from "./CodemationConsumerConfigLoader";
import { FastifyApiRouteRegistrar } from "./FastifyApiRouteRegistrar";

export interface CodemationFastifyHostOptions {
  readonly entryModuleUrl: string;
  readonly consumerRoot?: string;
  readonly configPathOverride?: string;
  readonly host?: string;
  readonly port?: number;
  readonly staticAssetRoot?: string;
  readonly registerPlugins?: (application: FastifyInstance) => void | Promise<void>;
}

export class CodemationFastifyHost {
  private readonly configLoader = new CodemationConsumerConfigLoader();
  private readonly apiRouteRegistrar = new FastifyApiRouteRegistrar();

  constructor(private readonly options: CodemationFastifyHostOptions) {}

  async start(): Promise<void> {
    const consumerRoot = await this.resolveConsumerRoot();
    const configResolution = await this.configLoader.load({
      consumerRoot,
      configPathOverride: this.options.configPathOverride,
    });
    const gateway = new CodemationServerGateway(
      configResolution.config,
      consumerRoot,
      configResolution.bootstrapSource ?? undefined,
      configResolution.workflowSources,
    );
    const application = Fastify({
      logger: { level: "error" },
    });
    const gatewayPreparation = gateway.prepare();
    try {
      await this.apiRouteRegistrar.register(application, gateway);
      await this.registerStaticHost(application, consumerRoot);
      await this.registerPlugins(application);
      await application.listen({
        host: this.options.host ?? "127.0.0.1",
        port: this.options.port ?? Number(process.env.CODEMATION_HTTP_PORT ?? "3000"),
      });
      await gatewayPreparation;
    } catch (error) {
      await this.safelyStopGatewayPreparation(gatewayPreparation);
      await this.safelyCloseGateway(gateway);
      await this.safelyCloseApplication(application);
      throw error;
    }
  }

  private async resolveConsumerRoot(): Promise<string> {
    if (this.options.consumerRoot) {
      return this.options.consumerRoot;
    }
    const entryFilePath = fileURLToPath(this.options.entryModuleUrl);
    let currentDirectory = path.dirname(entryFilePath);
    while (true) {
      if (await this.exists(path.resolve(currentDirectory, "package.json"))) {
        return currentDirectory;
      }
      const parentDirectory = path.dirname(currentDirectory);
      if (parentDirectory === currentDirectory) {
        return path.resolve(path.dirname(entryFilePath), "..");
      }
      currentDirectory = parentDirectory;
    }
  }

  private async registerStaticHost(application: FastifyInstance, consumerRoot: string): Promise<void> {
    if (process.env.NODE_ENV !== "production") {
      return;
    }
    const staticAssetRoot = this.options.staticAssetRoot ?? path.resolve(consumerRoot, "dist");
    await application.register(fastifyStatic, {
      root: staticAssetRoot,
    });
    application.get("/*", async (_request, reply) => {
      await reply.sendFile("index.html");
    });
  }

  private async registerPlugins(application: FastifyInstance): Promise<void> {
    if (!this.options.registerPlugins) {
      return;
    }
    await this.options.registerPlugins(application);
  }

  private async safelyStopGatewayPreparation(gatewayPreparation: Promise<void>): Promise<void> {
    try {
      await gatewayPreparation;
    } catch {
      return;
    }
  }

  private async safelyCloseGateway(gateway: CodemationServerGateway): Promise<void> {
    try {
      await gateway.close();
    } catch {
      return;
    }
  }

  private async safelyCloseApplication(application: FastifyInstance): Promise<void> {
    try {
      await application.close();
    } catch {
      return;
    }
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
