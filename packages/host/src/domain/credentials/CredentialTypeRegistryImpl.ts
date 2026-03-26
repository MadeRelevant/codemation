import type { CredentialTypeDefinition, CredentialTypeId, CredentialTypeRegistry } from "@codemation/core";

import { injectable } from "@codemation/core";

import type { AnyCredentialType, CredentialType } from "./CredentialServices";

@injectable()
export class CredentialTypeRegistryImpl implements CredentialTypeRegistry {
  private readonly credentialTypesById = new Map<CredentialTypeId, AnyCredentialType>();

  register(type: CredentialType<any, any, unknown>): void {
    if (this.credentialTypesById.has(type.definition.typeId)) {
      throw new Error(`Credential type already registered: ${type.definition.typeId}`);
    }
    this.credentialTypesById.set(type.definition.typeId, type);
  }

  listTypes(): ReadonlyArray<CredentialTypeDefinition> {
    return [...this.credentialTypesById.values()].map((entry) => entry.definition);
  }

  getType(typeId: CredentialTypeId): CredentialTypeDefinition | undefined {
    return this.credentialTypesById.get(typeId)?.definition;
  }

  getCredentialType(typeId: CredentialTypeId): AnyCredentialType | undefined {
    return this.credentialTypesById.get(typeId);
  }
}
