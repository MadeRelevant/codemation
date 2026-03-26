import { randomUUID } from "node:crypto";

import type { CredentialHealth, CredentialInstanceId, CredentialTypeId } from "@codemation/core";

import { CoreTokens, inject, injectable } from "@codemation/core";

import { ApplicationRequestError } from "../../application/ApplicationRequestError";

import { ApplicationTokens } from "../../applicationTokens";

import { CredentialFieldEnvOverlayService } from "./CredentialFieldEnvOverlayService";
import { CredentialInstanceService } from "./CredentialInstanceService";
import { CredentialRuntimeMaterialService } from "./CredentialRuntimeMaterialService";
import type { CredentialStore, AnyCredentialType, MutableCredentialSessionService } from "./CredentialServices";
import { CredentialTypeRegistryImpl } from "./CredentialServices";

@injectable()
export class CredentialTestService {
  constructor(
    @inject(CredentialInstanceService)
    private readonly credentialInstanceService: CredentialInstanceService,
    @inject(CredentialRuntimeMaterialService)
    private readonly credentialRuntimeMaterialService: CredentialRuntimeMaterialService,
    @inject(CredentialFieldEnvOverlayService)
    private readonly credentialFieldEnvOverlayService: CredentialFieldEnvOverlayService,
    @inject(CredentialTypeRegistryImpl)
    private readonly credentialTypeRegistry: CredentialTypeRegistryImpl,
    @inject(ApplicationTokens.CredentialStore)
    private readonly credentialStore: CredentialStore,
    @inject(CoreTokens.CredentialSessionService)
    private readonly credentialSessionService: MutableCredentialSessionService,
  ) {}

  async test(instanceId: CredentialInstanceId): Promise<CredentialHealth> {
    const instance = await this.credentialInstanceService.requireInstance(instanceId);
    const credentialType = this.requireCredentialType(instance.typeId);
    const material = await this.credentialRuntimeMaterialService.compose(instance);
    const { resolvedPublicConfig, resolvedMaterial } = this.credentialFieldEnvOverlayService.apply({
      definition: credentialType.definition,
      publicConfig: instance.publicConfig,
      material,
    });
    const health = await credentialType.test({
      instance,
      material: resolvedMaterial,
      publicConfig: resolvedPublicConfig,
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

  private requireCredentialType(typeId: CredentialTypeId): AnyCredentialType {
    const credentialType = this.credentialTypeRegistry.getCredentialType(typeId);
    if (!credentialType) {
      throw new ApplicationRequestError(400, `Unknown credential type: ${typeId}`);
    }
    return credentialType;
  }
}
