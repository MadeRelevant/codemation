import { inject, injectable } from "@codemation/core";

import { InternalAuthBootstrapFactory } from "../../frontend/InternalAuthBootstrapFactory";

/**
 * Serves **auth-only** bootstrap JSON for the Next.js edge/runtime (sessions, providers, feature flags that
 * must not be exposed on unauthenticated document requests). Pair with {@link PublicFrontendBootstrapHttpRouteHandler}.
 */
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
