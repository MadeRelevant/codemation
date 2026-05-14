import { inject, injectable } from "@codemation/core";

import { FrontendAppConfigFactory } from "./FrontendAppConfigFactory";
import type { PublicFrontendBootstrap } from "./PublicFrontendBootstrap";

@injectable()
export class PublicFrontendBootstrapFactory {
  constructor(
    @inject(FrontendAppConfigFactory)
    private readonly frontendAppConfigFactory: FrontendAppConfigFactory,
  ) {}

  create(): PublicFrontendBootstrap {
    const frontendAppConfig = this.frontendAppConfigFactory.create();
    const bootstrap: PublicFrontendBootstrap = {
      credentialsEnabled: frontendAppConfig.auth.credentialsEnabled,
      logoUrl: frontendAppConfig.logoUrl,
      oauthProviders: frontendAppConfig.auth.oauthProviders,
      productName: frontendAppConfig.productName,
      uiAuthEnabled: frontendAppConfig.auth.uiAuthEnabled,
    };
    if (frontendAppConfig.auth.cpWebOrigin) {
      return { ...bootstrap, cpWebOrigin: frontendAppConfig.auth.cpWebOrigin };
    }
    return bootstrap;
  }
}
