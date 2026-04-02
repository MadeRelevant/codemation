import { inject, injectable } from "@codemation/core";

import { PublicFrontendBootstrapFactory } from "../../frontend/PublicFrontendBootstrapFactory";

@injectable()
export class PublicFrontendBootstrapHttpRouteHandler {
  constructor(
    @inject(PublicFrontendBootstrapFactory)
    private readonly bootstrapFactory: PublicFrontendBootstrapFactory,
  ) {}

  getBootstrap(): Response {
    return new Response(JSON.stringify(this.bootstrapFactory.create()), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
}
