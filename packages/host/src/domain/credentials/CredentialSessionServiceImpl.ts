import type {
  CredentialBindingKey,
  CredentialInstanceId,
  CredentialSessionService,
  WorkflowRepository,
} from "@codemation/core";

import { CoreTokens, CredentialUnboundError, inject, injectable } from "@codemation/core";

import { ApplicationRequestError } from "../../application/ApplicationRequestError";

import { ApplicationTokens } from "../../applicationTokens";

import { WorkflowCredentialNodeResolver } from "./WorkflowCredentialNodeResolver";
import { CredentialFieldEnvOverlayService } from "./CredentialFieldEnvOverlayService";
import { CredentialRuntimeMaterialService } from "./CredentialRuntimeMaterialService";
import type { CredentialStore } from "./CredentialServices";
import { CredentialTypeRegistryImpl } from "./CredentialServices";

@injectable()
export class CredentialSessionServiceImpl implements CredentialSessionService {
  private readonly cachedSessionsByInstanceId = new Map<CredentialInstanceId, Promise<unknown>>();
  private readonly cachedInstanceIdsByBindingKey = new Map<string, CredentialInstanceId>();

  constructor(
    @inject(ApplicationTokens.CredentialStore)
    private readonly credentialStore: CredentialStore,
    @inject(CredentialRuntimeMaterialService)
    private readonly credentialRuntimeMaterialService: CredentialRuntimeMaterialService,
    @inject(CredentialFieldEnvOverlayService)
    private readonly credentialFieldEnvOverlayService: CredentialFieldEnvOverlayService,
    @inject(CredentialTypeRegistryImpl)
    private readonly credentialTypeRegistry: CredentialTypeRegistryImpl,
    @inject(CoreTokens.WorkflowRepository)
    private readonly workflowRepository: WorkflowRepository,
    @inject(WorkflowCredentialNodeResolver)
    private readonly workflowCredentialNodeResolver: WorkflowCredentialNodeResolver,
  ) {}

  async getSession<TSession = unknown>(
    args: Readonly<{ workflowId: string; nodeId: string; slotKey: string }>,
  ): Promise<TSession> {
    const workflow = this.workflowRepository.get(decodeURIComponent(args.workflowId));
    const displayLabel = workflow
      ? this.workflowCredentialNodeResolver.describeCredentialNodeDisplay(workflow, args.nodeId)
      : undefined;
    const requirement = workflow
      ? this.workflowCredentialNodeResolver.findRequirement(workflow, args.nodeId, args.slotKey)?.requirement
      : undefined;
    const bindingKey: CredentialBindingKey = {
      workflowId: args.workflowId,
      nodeId: args.nodeId,
      slotKey: args.slotKey,
    };
    const binding = await this.credentialStore.getBinding(bindingKey);
    if (!binding) {
      const unbound = new CredentialUnboundError(bindingKey, requirement?.acceptedTypes ?? []);
      if (displayLabel) {
        throw new Error(`${displayLabel}: ${unbound.message}`, { cause: unbound });
      }
      throw unbound;
    }
    const bindingCacheKey = this.toBindingKeyString(bindingKey);
    this.cachedInstanceIdsByBindingKey.set(bindingCacheKey, binding.instanceId);
    const cachedSession = this.cachedSessionsByInstanceId.get(binding.instanceId);
    if (cachedSession) {
      return (await cachedSession) as TSession;
    }
    const nextSessionPromise = this.createSession(binding.instanceId, displayLabel).catch((error) => {
      this.cachedSessionsByInstanceId.delete(binding.instanceId);
      throw error;
    });
    this.cachedSessionsByInstanceId.set(binding.instanceId, nextSessionPromise);
    return (await nextSessionPromise) as TSession;
  }

  evictInstance(instanceId: CredentialInstanceId): void {
    this.cachedSessionsByInstanceId.delete(instanceId);
  }

  evictBinding(bindingKey: CredentialBindingKey): void {
    const cacheKey = this.toBindingKeyString(bindingKey);
    const instanceId = this.cachedInstanceIdsByBindingKey.get(cacheKey);
    if (instanceId) {
      this.cachedSessionsByInstanceId.delete(instanceId);
    }
    this.cachedInstanceIdsByBindingKey.delete(cacheKey);
  }

  private async createSession(instanceId: CredentialInstanceId, displayLabel?: string): Promise<unknown> {
    const instance = await this.credentialStore.getInstance(instanceId);
    if (!instance) {
      throw new ApplicationRequestError(404, `Unknown credential instance: ${instanceId}`);
    }
    const registeredType = this.credentialTypeRegistry.getRegisteredType(instance.typeId);
    if (!registeredType) {
      const prefix = displayLabel ? `${displayLabel}: ` : "";
      throw new ApplicationRequestError(
        400,
        `${prefix}Credential type "${instance.typeId}" is not registered in this runtime (binding points at an unknown type).`,
      );
    }
    const material = await this.credentialRuntimeMaterialService.compose(instance);
    const { resolvedPublicConfig, resolvedMaterial } = this.credentialFieldEnvOverlayService.apply({
      definition: registeredType.definition,
      publicConfig: instance.publicConfig,
      material,
    });
    return await registeredType.createSession({
      instance,
      material: resolvedMaterial,
      publicConfig: resolvedPublicConfig,
    });
  }

  private toBindingKeyString(bindingKey: CredentialBindingKey): string {
    return `${bindingKey.workflowId}:${bindingKey.nodeId}:${bindingKey.slotKey}`;
  }
}
