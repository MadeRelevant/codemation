import { inject } from "@codemation/core";
import { QueryHandler } from "../bus/QueryHandler";
import { HandlesQuery } from "../../infrastructure/di/HandlesQueryRegistry";
import type { AppsResponse } from "../contracts/CredentialContractsRegistry";
import { GetCredentialAppsQuery } from "./GetCredentialAppsQuery";
import { CredentialInstanceService } from "../../domain/credentials/CredentialInstanceService";
import { AppGalleryProjector } from "../credentials/AppGalleryProjector";
import { ControlPlaneCatalogFetcher } from "../../credentials/ControlPlaneCatalogFetcher";

@HandlesQuery.for(GetCredentialAppsQuery)
export class GetCredentialAppsQueryHandler extends QueryHandler<GetCredentialAppsQuery, AppsResponse> {
  constructor(
    @inject(CredentialInstanceService)
    private readonly credentialInstanceService: CredentialInstanceService,
    @inject(AppGalleryProjector)
    private readonly appGalleryProjector: AppGalleryProjector,
    @inject(ControlPlaneCatalogFetcher)
    private readonly catalogFetcher: ControlPlaneCatalogFetcher,
  ) {
    super();
  }

  async execute(): Promise<AppsResponse> {
    const instances = await this.credentialInstanceService.listInstances();
    return this.appGalleryProjector.project(this.catalogFetcher.mcpServers, instances);
  }
}
