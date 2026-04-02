import { inject, injectable } from "@codemation/core";

import { InternalAuthBootstrapFactory } from "../../frontend/InternalAuthBootstrapFactory";

@injectable()
export class InternalAuthBootstrapHttpRouteHandler {
  constructor(
    @inject(InternalAuthBootstrapFactory)
    private readonly bootstrapFactory: InternalAuthBootstrapFactory,
  ) {}

  getBootstrap(): Response {
    return new Response(JSON.stringify(this.bootstrapFactory.create()), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
}
