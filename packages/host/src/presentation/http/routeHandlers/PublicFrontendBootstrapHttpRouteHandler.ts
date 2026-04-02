import { inject, injectable } from "@codemation/core";

import { PublicFrontendBootstrapFactory } from "../../frontend/PublicFrontendBootstrapFactory";

/**
 * Serves **public** bootstrap JSON safe to hydrate on anonymous pages (branding, non-sensitive UI config).
 * Sensitive auth material is delivered through {@link InternalAuthBootstrapHttpRouteHandler} behind a session.
 */
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
