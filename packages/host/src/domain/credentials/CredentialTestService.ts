import { randomUUID } from "node:crypto";

import type {
CredentialHealth,
CredentialInstanceId,
CredentialTypeId
} from "@codemation/core";

import { CoreTokens,inject,injectable } from "@codemation/core";

import { ApplicationRequestError } from "../../application/ApplicationRequestError";


import { ApplicationTokens } from "../../applicationTokens";

import { CredentialInstanceService } from "./CredentialInstanceService";
import { CredentialRuntimeMaterialService } from "./CredentialRuntimeMaterialService";
import type { CredentialStore,MutableCredentialSessionService,RegisteredCredentialType } from "./CredentialServices";
import { CredentialTypeRegistryImpl } from "./CredentialServices";

@injectable()
export class CredentialTestService {
  constructor(
    @inject(CredentialInstanceService)
    private readonly credentialInstanceService: CredentialInstanceService,
    @inject(CredentialRuntimeMaterialService)
    private readonly credentialRuntimeMaterialService: CredentialRuntimeMaterialService,
    @inject(CredentialTypeRegistryImpl)
    private readonly credentialTypeRegistry: CredentialTypeRegistryImpl,
    @inject(ApplicationTokens.CredentialStore)
    private readonly credentialStore: CredentialStore,
    @inject(CoreTokens.CredentialSessionService)
    private readonly credentialSessionService: MutableCredentialSessionService,
  ) {}

  async test(instanceId: CredentialInstanceId): Promise<CredentialHealth> {
    const instance = await this.credentialInstanceService.requireInstance(instanceId);
    const registeredType = this.requireRegisteredType(instance.typeId);
    const material = await this.credentialRuntimeMaterialService.compose(instance);
    const health = await registeredType.test({
      instance,
      material,
      publicConfig: instance.publicConfig,
    });
    const testedAt = health.testedAt ?? new Date().toISOString();
    await this.credentialStore.saveTestResult({
      testId: randomUUID(),
      instanceId,
      health: {
        ...health,
        testedAt,
      },
      testedAt,
      expiresAt: health.expiresAt,
    });
    this.credentialSessionService.evictInstance(instanceId);
    return {
      ...health,
      testedAt,
    };
  }

  private requireRegisteredType(typeId: CredentialTypeId): RegisteredCredentialType {
    const registeredType = this.credentialTypeRegistry.getRegisteredType(typeId);
    if (!registeredType) {
      throw new ApplicationRequestError(400, `Unknown credential type: ${typeId}`);
    }
    return registeredType;
  }
}
