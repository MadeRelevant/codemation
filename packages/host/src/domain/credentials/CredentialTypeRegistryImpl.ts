import type { CredentialTypeDefinition, CredentialTypeId, CredentialTypeRegistry } from "@codemation/core";

import { injectable } from "@codemation/core";

import type { RegisteredCredentialType } from "./CredentialServices";

@injectable()
export class CredentialTypeRegistryImpl implements CredentialTypeRegistry {
  private readonly registeredTypesById = new Map<CredentialTypeId, RegisteredCredentialType>();

  register(type: RegisteredCredentialType): void {
    if (this.registeredTypesById.has(type.definition.typeId)) {
      throw new Error(`Credential type already registered: ${type.definition.typeId}`);
    }
    this.registeredTypesById.set(type.definition.typeId, type);
  }

  listTypes(): ReadonlyArray<CredentialTypeDefinition> {
    return [...this.registeredTypesById.values()].map((entry) => entry.definition);
  }

  getType(typeId: CredentialTypeId): CredentialTypeDefinition | undefined {
    return this.registeredTypesById.get(typeId)?.definition;
  }

  getRegisteredType(typeId: CredentialTypeId): RegisteredCredentialType | undefined {
    return this.registeredTypesById.get(typeId);
  }
}
