
import type {
CredentialBindingKey,
CredentialInstanceId,
CredentialSessionService,
WorkflowRegistry
} from "@codemation/core";

import { CoreTokens,CredentialUnboundError,inject,injectable } from "@codemation/core";

import { ApplicationRequestError } from "../../application/ApplicationRequestError";


import { ApplicationTokens } from "../../applicationTokens";

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
    @inject(CredentialTypeRegistryImpl)
    private readonly credentialTypeRegistry: CredentialTypeRegistryImpl,
    @inject(CoreTokens.WorkflowRegistry)
    private readonly workflowRegistry: WorkflowRegistry,
  ) {}

  async getSession<TSession = unknown>(args: Readonly<{ workflowId: string; nodeId: string; slotKey: string }>): Promise<TSession> {
    const workflow = this.workflowRegistry.get(decodeURIComponent(args.workflowId));
    const requirement = workflow?.nodes
      .find((node) => node.id === args.nodeId)
      ?.config.getCredentialRequirements?.()
      .find((entry) => entry.slotKey === args.slotKey);
    const bindingKey: CredentialBindingKey = {
      workflowId: args.workflowId,
      nodeId: args.nodeId,
      slotKey: args.slotKey,
    };
    const binding = await this.credentialStore.getBinding(bindingKey);
    if (!binding) {
      throw new CredentialUnboundError(bindingKey, requirement?.acceptedTypes ?? []);
    }
    const bindingCacheKey = this.toBindingKeyString(bindingKey);
    this.cachedInstanceIdsByBindingKey.set(bindingCacheKey, binding.instanceId);
    const cachedSession = this.cachedSessionsByInstanceId.get(binding.instanceId);
    if (cachedSession) {
      return (await cachedSession) as TSession;
    }
    const nextSessionPromise = this.createSession(binding.instanceId).catch((error) => {
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

  private async createSession(instanceId: CredentialInstanceId): Promise<unknown> {
    const instance = await this.credentialStore.getInstance(instanceId);
    if (!instance) {
      throw new ApplicationRequestError(404, `Unknown credential instance: ${instanceId}`);
    }
    const registeredType = this.credentialTypeRegistry.getRegisteredType(instance.typeId);
    if (!registeredType) {
      throw new ApplicationRequestError(400, `Unknown credential type: ${instance.typeId}`);
    }
    const material = await this.credentialRuntimeMaterialService.compose(instance);
    return await registeredType.createSession({
      instance,
      material,
      publicConfig: instance.publicConfig,
    });
  }

  private toBindingKeyString(bindingKey: CredentialBindingKey): string {
    return `${bindingKey.workflowId}:${bindingKey.nodeId}:${bindingKey.slotKey}`;
  }
}
