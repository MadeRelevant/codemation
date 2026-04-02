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
    return {
      credentialsEnabled: frontendAppConfig.auth.credentialsEnabled,
      logoUrl: frontendAppConfig.logoUrl,
      oauthProviders: frontendAppConfig.auth.oauthProviders,
      productName: frontendAppConfig.productName,
      uiAuthEnabled: frontendAppConfig.auth.uiAuthEnabled,
    };
  }
}
