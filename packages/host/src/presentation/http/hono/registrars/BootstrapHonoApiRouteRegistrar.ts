import { inject, injectable, registry } from "@codemation/core";
import { Hono } from "hono";

import { ApplicationTokens } from "../../../../applicationTokens";
import { ApiPaths } from "../../ApiPaths";
import { InternalAuthBootstrapHttpRouteHandler } from "../../routeHandlers/InternalAuthBootstrapHttpRouteHandler";
import { PublicFrontendBootstrapHttpRouteHandler } from "../../routeHandlers/PublicFrontendBootstrapHttpRouteHandler";
import type { HonoApiRouteRegistrar } from "../HonoApiRouteRegistrar";

@injectable()
@registry([{ token: ApplicationTokens.HonoApiRouteRegistrar, useClass: BootstrapHonoApiRouteRegistrar }])
export class BootstrapHonoApiRouteRegistrar implements HonoApiRouteRegistrar {
  constructor(
    @inject(PublicFrontendBootstrapHttpRouteHandler)
    private readonly publicFrontendBootstrapHttpRouteHandler: PublicFrontendBootstrapHttpRouteHandler,
    @inject(InternalAuthBootstrapHttpRouteHandler)
    private readonly internalAuthBootstrapHttpRouteHandler: InternalAuthBootstrapHttpRouteHandler,
  ) {}

  register(app: Hono): void {
    app.get(this.resolveRelativePath(ApiPaths.frontendBootstrap()), () =>
      this.publicFrontendBootstrapHttpRouteHandler.getBootstrap(),
    );
    app.get(this.resolveRelativePath(ApiPaths.internalAuthBootstrap()), () =>
      this.internalAuthBootstrapHttpRouteHandler.getBootstrap(),
    );
  }

  private resolveRelativePath(pathname: string): string {
    return pathname.replace(/^\/api/, "");
  }
}
