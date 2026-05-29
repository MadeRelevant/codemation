import type { CredentialTypeDefinition, CredentialTypeId, CredentialTypeRegistry } from "@codemation/core";

import { inject, injectable } from "@codemation/core";

import { ApplicationTokens } from "../../applicationTokens";
import type { LoggerFactory } from "../../application/logging/Logger";
import type { AnyCredentialType } from "./CredentialServices";

export type CredentialTypeSource = "plugin" | "config" | "controlPlane";

const SOURCE_PRIORITY: Record<CredentialTypeSource, number> = {
  plugin: 0,
  config: 1,
  controlPlane: 2,
};

type RegistryEntry = Readonly<{
  type: AnyCredentialType;
  source: CredentialTypeSource;
}>;

@injectable()
export class CredentialTypeRegistryImpl implements CredentialTypeRegistry {
  private readonly entries = new Map<CredentialTypeId, RegistryEntry>();
  private readonly bySource = new Map<CredentialTypeSource, Set<CredentialTypeId>>();

  constructor(@inject(ApplicationTokens.LoggerFactory) private readonly loggers: LoggerFactory) {}

  merge(source: CredentialTypeSource, types: ReadonlyArray<AnyCredentialType>): void {
    const logger = this.loggers.create("CredentialTypeRegistryImpl");
    for (const type of types) {
      this.insert(source, type, logger);
    }
  }

  mergeDefinitions(source: CredentialTypeSource, definitions: ReadonlyArray<CredentialTypeDefinition>): void {
    const logger = this.loggers.create("CredentialTypeRegistryImpl");
    for (const definition of definitions) {
      const existing = this.entries.get(definition.typeId);
      const sourcePriority = SOURCE_PRIORITY[source];
      if (existing) {
        if (sourcePriority < SOURCE_PRIORITY[existing.source]) {
          logger.warn(
            `CredentialTypeRegistryImpl: id collision — lower-priority source "${source}" ignored for typeId "${definition.typeId}" (current source: "${existing.source}")`,
          );
          continue;
        }
        if (sourcePriority > SOURCE_PRIORITY[existing.source]) {
          logger.warn(
            `CredentialTypeRegistryImpl: typeId "${definition.typeId}" shadowed — "${existing.source}" overridden by higher-priority source "${source}"`,
          );
          this.bySource.get(existing.source)?.delete(definition.typeId);
        }
        const nextType: AnyCredentialType =
          sourcePriority === SOURCE_PRIORITY[existing.source]
            ? { ...existing.type, definition }
            : {
                definition,
                createSession: this.createUnsupportedSessionFactory(definition.typeId, source),
                test: this.createUnsupportedHealthTester(definition.typeId, source),
              };
        this.recordEntry(definition.typeId, { type: nextType, source });
        continue;
      }
      const stubType: AnyCredentialType = {
        definition,
        createSession: this.createUnsupportedSessionFactory(definition.typeId, source),
        test: this.createUnsupportedHealthTester(definition.typeId, source),
      };
      this.recordEntry(definition.typeId, { type: stubType, source });
    }
  }

  clear(source: CredentialTypeSource): void {
    const ids = this.bySource.get(source);
    if (!ids) {
      return;
    }
    for (const id of ids) {
      this.entries.delete(id);
    }
    this.bySource.delete(source);
  }

  listTypes(): ReadonlyArray<CredentialTypeDefinition> {
    return [...this.entries.values()].map((entry) => entry.type.definition);
  }

  getType(typeId: CredentialTypeId): CredentialTypeDefinition | undefined {
    return this.entries.get(typeId)?.type.definition;
  }

  getCredentialType(typeId: CredentialTypeId): AnyCredentialType | undefined {
    return this.entries.get(typeId)?.type;
  }

  private insert(
    source: CredentialTypeSource,
    type: AnyCredentialType,
    logger: ReturnType<LoggerFactory["create"]>,
  ): void {
    const typeId = type.definition.typeId;
    const existing = this.entries.get(typeId);
    const sourcePriority = SOURCE_PRIORITY[source];
    if (existing) {
      if (sourcePriority < SOURCE_PRIORITY[existing.source]) {
        logger.warn(
          `CredentialTypeRegistryImpl: id collision — lower-priority source "${source}" ignored for typeId "${typeId}" (current source: "${existing.source}")`,
        );
        return;
      }
      if (sourcePriority > SOURCE_PRIORITY[existing.source]) {
        logger.warn(
          `CredentialTypeRegistryImpl: typeId "${typeId}" shadowed — "${existing.source}" overridden by higher-priority source "${source}"`,
        );
        this.bySource.get(existing.source)?.delete(typeId);
      }
    }
    this.recordEntry(typeId, { type, source });
  }

  private recordEntry(typeId: CredentialTypeId, entry: RegistryEntry): void {
    this.entries.set(typeId, entry);
    if (!this.bySource.has(entry.source)) {
      this.bySource.set(entry.source, new Set());
    }
    this.bySource.get(entry.source)!.add(typeId);
  }

  private createUnsupportedSessionFactory(
    typeId: CredentialTypeId,
    source: CredentialTypeSource,
  ): AnyCredentialType["createSession"] {
    return async () => {
      throw new Error(
        `Credential type "${typeId}" (source "${source}") was registered with definition only — no createSession implementation is available in this runtime.`,
      );
    };
  }

  private createUnsupportedHealthTester(
    typeId: CredentialTypeId,
    source: CredentialTypeSource,
  ): AnyCredentialType["test"] {
    return async () => ({
      status: "unknown" as const,
      message: `Credential type "${typeId}" (source "${source}") has no local test implementation.`,
    });
  }
}
