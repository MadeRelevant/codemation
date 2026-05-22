import type { CredentialTypeDefinition, CredentialTypeId, CredentialTypeRegistry } from "@codemation/core";

import { inject, injectable } from "@codemation/core";

import { ApplicationTokens } from "../../applicationTokens";
import type { LoggerFactory } from "../../application/logging/Logger";
import type { AnyCredentialType, CredentialType } from "./CredentialServices";

@injectable()
export class CredentialTypeRegistryImpl implements CredentialTypeRegistry {
  private readonly credentialTypesById = new Map<CredentialTypeId, AnyCredentialType>();

  constructor(@inject(ApplicationTokens.LoggerFactory) private readonly loggers: LoggerFactory) {}

  register(type: CredentialType<any, any, unknown>): void {
    if (this.credentialTypesById.has(type.definition.typeId)) {
      throw new Error(`Credential type already registered: ${type.definition.typeId}`);
    }
    this.credentialTypesById.set(type.definition.typeId, type);
  }

  /**
   * Applies control-plane credential type overrides. Full replacement per typeId —
   * any existing registration for that typeId (from framework defaults or consumer config)
   * is replaced. Types not present in the overrides array are unaffected.
   *
   * Safe to call repeatedly (idempotent for the same payload).
   */
  applyControlPlaneOverrides(overrides: ReadonlyArray<CredentialTypeDefinition>): void {
    const logger = this.loggers.create("CredentialTypeRegistryImpl");
    for (const definition of overrides) {
      const existing = this.credentialTypesById.get(definition.typeId);
      if (!existing) {
        logger.warn(
          `CredentialTypeRegistryImpl: control-plane override for unknown typeId "${definition.typeId}" — skipped`,
        );
        continue;
      }
      this.credentialTypesById.set(definition.typeId, {
        ...existing,
        definition,
      });
    }
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
