/**
 * Shared internal helpers for defineNode and definePollingTrigger.
 * Not part of the public API — import only from authoring helpers.
 */
import type { AnyCredentialType, CredentialRequirement, CredentialTypeId } from "../contracts/credentialTypes";
import type { NodeExecutionContext } from "../contracts/runtimeTypes";
import type { RunnableNodeConfig } from "../contracts/workflowTypes";
import type { DefinedNodeCredentialAccessors, DefinedNodeCredentialBindings } from "./defineNode.types";

type ResolvableCredentialType = AnyCredentialType | CredentialTypeId;

export const definedNodeCredentialRequirementFactory = {
  create(bindings: DefinedNodeCredentialBindings | undefined): ReadonlyArray<CredentialRequirement> {
    if (!bindings) {
      return [];
    }
    return Object.entries(bindings).map(([slotKey, binding]) => {
      if (typeof binding === "string" || this.isCredentialType(binding)) {
        return {
          slotKey,
          label: this.humanize(slotKey),
          acceptedTypes: [this.resolveTypeId(binding)],
        };
      }

      const types = Array.isArray(binding.type) ? binding.type : [binding.type];
      return {
        slotKey,
        label: binding.label ?? this.humanize(slotKey),
        acceptedTypes: types.map((entry) => this.resolveTypeId(entry)),
        optional: binding.optional,
        helpText: binding.helpText,
        helpUrl: binding.helpUrl,
      };
    });
  },

  isCredentialType(value: unknown): value is AnyCredentialType {
    return (
      Boolean(value) &&
      typeof value === "object" &&
      "definition" in (value as Record<string, unknown>) &&
      typeof (value as AnyCredentialType).definition?.typeId === "string"
    );
  },

  resolveTypeId(type: ResolvableCredentialType): string {
    return typeof type === "string" ? type : type.definition.typeId;
  },

  humanize(key: string): string {
    return key
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/[-_.]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^./, (character) => character.toUpperCase());
  },
} as const;

export const definedNodeCredentialAccessorFactory = {
  create<TBindings extends DefinedNodeCredentialBindings | undefined>(
    bindings: TBindings,
    ctx:
      | NodeExecutionContext<RunnableNodeConfig<any, any>>
      | { getCredential<TSession = unknown>(slotKey: string): Promise<TSession> },
  ): DefinedNodeCredentialAccessors<TBindings> {
    if (!bindings) {
      return {} as DefinedNodeCredentialAccessors<TBindings>;
    }
    const entries = Object.keys(bindings).map((slotKey) => [slotKey, () => ctx.getCredential(slotKey)] as const);
    return Object.fromEntries(entries) as DefinedNodeCredentialAccessors<TBindings>;
  },
} as const;
