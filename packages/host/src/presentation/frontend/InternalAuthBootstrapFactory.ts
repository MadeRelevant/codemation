import { inject, injectable } from "@codemation/core";

import { ApplicationTokens } from "../../applicationTokens";
import type { AppConfig } from "../config/AppConfig";
import { CodemationFrontendAuthSnapshotFactory } from "./CodemationFrontendAuthSnapshotFactory";
import type { InternalAuthBootstrap } from "./InternalAuthBootstrap";

@injectable()
export class InternalAuthBootstrapFactory {
  constructor(
    @inject(ApplicationTokens.AppConfig)
    private readonly appConfig: AppConfig,
    @inject(CodemationFrontendAuthSnapshotFactory)
    private readonly authSnapshotFactory: CodemationFrontendAuthSnapshotFactory,
  ) {}

  create(): InternalAuthBootstrap {
    const authSnapshot = this.authSnapshotFactory.createFromAppConfig(this.appConfig);
    return {
      authConfig: this.appConfig.auth,
      credentialsEnabled: authSnapshot.credentialsEnabled,
      oauthProviders: authSnapshot.oauthProviders,
      uiAuthEnabled: authSnapshot.uiAuthEnabled,
    };
  }
}
