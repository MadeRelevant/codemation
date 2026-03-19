import type { FastifyInstance, FastifyReply, FastifyRequest, HTTPMethods } from "fastify";
import { CodemationServerGateway } from "../http/CodemationServerGateway";
import { FastifyRequestFactory } from "./FastifyRequestFactory";
import { FastifyResponseWriter } from "./FastifyResponseWriter";

type ApiRouteParams = Readonly<{ "*": string }>;

export class FastifyApiRouteRegistrar {
  private readonly requestFactory = new FastifyRequestFactory();
  private readonly responseWriter = new FastifyResponseWriter();

  async register(application: FastifyInstance, gateway: CodemationServerGateway): Promise<void> {
    const methods: ReadonlyArray<HTTPMethods> = ["GET", "POST", "PUT", "PATCH", "DELETE"];
    for (const method of methods) {
      application.route({
        method,
        url: "/api/*",
        handler: async (request: FastifyRequest<{ Params: ApiRouteParams }>, reply: FastifyReply) => {
          const fetchRequest = this.requestFactory.create(request);
          const response = await gateway.dispatch(fetchRequest);
          await this.responseWriter.write(reply, response);
        },
      });
    }
  }
}
