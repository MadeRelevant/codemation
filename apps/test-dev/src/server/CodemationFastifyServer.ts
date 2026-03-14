import fastifyStatic from "@fastify/static";
import type { CodemationConfig } from "@codemation/frontend";
import { CodemationServerGateway } from "@codemation/frontend/server";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest, type HTTPMethods } from "fastify";
import path from "node:path";
import { FastifyRequestFactory } from "./FastifyRequestFactory";
import { FastifyResponseWriter } from "./FastifyResponseWriter";

type ApiRouteParams = Readonly<{ "*": string }>;

export class CodemationFastifyServer {
  private readonly requestFactory = new FastifyRequestFactory();
  private readonly responseWriter = new FastifyResponseWriter();
  private readonly serverGateway: CodemationServerGateway;

  constructor(
    private readonly config: CodemationConfig,
    private readonly consumerRoot: string,
    configSource: string,
  ) {
    this.serverGateway = new CodemationServerGateway(config, consumerRoot, configSource);
  }

  async start(): Promise<void> {
    await this.serverGateway.prepare();
    const application = Fastify({
      logger: true,
    });
    await this.registerApiRoutes(application);
    await this.registerStaticHost(application);
    const port = Number(process.env.CODEMATION_HTTP_PORT ?? "3000");
    await application.listen({
      host: "127.0.0.1",
      port,
    });
  }

  private async registerApiRoutes(application: FastifyInstance): Promise<void> {
    const methods: ReadonlyArray<HTTPMethods> = ["GET", "POST", "PUT", "PATCH", "DELETE"];
    for (const method of methods) {
      application.route({
        method,
        url: "/api/*",
        handler: async (request: FastifyRequest<{ Params: ApiRouteParams }>, reply: FastifyReply) => {
          const fetchRequest = this.requestFactory.create(request);
          const response = await this.serverGateway.dispatch(fetchRequest, request.params["*"]);
          await this.responseWriter.write(reply, response);
        },
      });
    }
  }

  private async registerStaticHost(application: FastifyInstance): Promise<void> {
    if (process.env.NODE_ENV !== "production") {
      return;
    }
    const distRoot = path.resolve(this.consumerRoot, "dist");
    await application.register(fastifyStatic, {
      root: distRoot,
    });
    application.get("/*", async (_request, reply) => {
      await reply.sendFile("index.html");
    });
  }
}
