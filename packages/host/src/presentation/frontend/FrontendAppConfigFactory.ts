import { inject, injectable } from "@codemation/core";
import { ApplicationTokens } from "../../applicationTokens";
import type { AppConfig } from "../config/AppConfig";
import { ApiPaths } from "../http/ApiPaths";
import type { FrontendAppConfig } from "./FrontendAppConfig";
import { CodemationFrontendAuthSnapshotFactory } from "./CodemationFrontendAuthSnapshotFactory";

@injectable()
export class FrontendAppConfigFactory {
  constructor(
    @inject(ApplicationTokens.AppConfig)
    private readonly appConfig: AppConfig,
    @inject(CodemationFrontendAuthSnapshotFactory)
    private readonly authSnapshotFactory: CodemationFrontendAuthSnapshotFactory,
  ) {}

  create(): FrontendAppConfig {
    const rawProductName = this.appConfig.whitelabel.productName?.trim();
    const rawLogoPath = this.appConfig.whitelabel.logoPath?.trim();
    return {
      auth: this.authSnapshotFactory.createFromAppConfig(this.appConfig),
      productName: rawProductName && rawProductName.length > 0 ? rawProductName : "Codemation",
      logoUrl: rawLogoPath && rawLogoPath.length > 0 ? ApiPaths.whitelabelLogo() : null,
    };
  }
}
