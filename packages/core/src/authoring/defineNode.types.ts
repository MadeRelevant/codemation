import type {
  AnyCredentialType,
  CredentialJsonRecord,
  CredentialRequirement,
  CredentialTypeId,
} from "../contracts/credentialTypes";
import type { RunnableNode, RunnableNodeExecuteArgs, NodeExecutionContext } from "../contracts/runtimeTypes";
import type { Item, Items, RunnableNodeConfig } from "../contracts/workflowTypes";
import type { TypeToken } from "../di";
import { node as persistedNode } from "../runtime-types/runtimeTypeDecorators.types";
import type { ZodType } from "zod";
import { z } from "zod";
import { DefinedNodeRegistry } from "./DefinedNodeRegistry";

type MaybePromise<TValue> = TValue | Promise<TValue>;

type ResolvableCredentialType = AnyCredentialType | CredentialTypeId;

type SessionForCredentialType<TCredential extends ResolvableCredentialType> = TCredential extends AnyCredentialType
  ? Awaited<ReturnType<TCredential["createSession"]>>
  : unknown;

export type DefinedNodeCredentialBinding =
  | ResolvableCredentialType
  | Readonly<{
      readonly type: ResolvableCredentialType | ReadonlyArray<ResolvableCredentialType>;
      readonly label?: string;
      readonly optional?: true;
      readonly helpText?: string;
      readonly helpUrl?: string;
    }>;

export type DefinedNodeCredentialBindings = Readonly<Record<string, DefinedNodeCredentialBinding>>;

type SessionForBinding<TBinding extends DefinedNodeCredentialBinding> =
  TBinding extends Readonly<{ type: infer TType }>
    ? TType extends ReadonlyArray<infer TEntry>
      ? SessionForCredentialType<TEntry & ResolvableCredentialType>
      : SessionForCredentialType<TType & ResolvableCredentialType>
    : SessionForCredentialType<TBinding & ResolvableCredentialType>;

export type DefinedNodeCredentialAccessors<TBindings extends DefinedNodeCredentialBindings | undefined> =
  TBindings extends DefinedNodeCredentialBindings
    ? Readonly<{
        [TKey in keyof TBindings]: () => Promise<SessionForBinding<TBindings[TKey]>>;
      }>
    : Readonly<Record<string, never>>;

export interface DefinedNodeRunContext<
  TConfig extends CredentialJsonRecord,
  TBindings extends DefinedNodeCredentialBindings | undefined,
> {
  readonly config: TConfig;
  readonly credentials: DefinedNodeCredentialAccessors<TBindings>;
  readonly execution: NodeExecutionContext<RunnableNodeConfig<TConfig, unknown>>;
}

/**
 * Arguments for {@link defineNode} `execute` (engine `ctx` matches {@link RunnableNode.execute};
 * the second callback parameter adds {@link DefinedNodeRunContext} for credential accessors).
 */
export type DefineNodeExecuteArgs<TConfig extends CredentialJsonRecord, TInputJson> = Readonly<{
  input: TInputJson;
  item: Item;
  itemIndex: number;
  items: Items;
  ctx: NodeExecutionContext<RunnableNodeConfig<TInputJson, unknown> & Readonly<{ config: TConfig }>>;
}>;

export interface DefinedNode<
  TKey extends string,
  TConfig extends CredentialJsonRecord,
  TInputJson,
  TOutputJson,
  _TBindings extends DefinedNodeCredentialBindings | undefined = undefined,
> {
  readonly kind: "defined-node";
  readonly key: TKey;
  readonly title: string;
  readonly description?: string;
  create(config: TConfig, name?: string, id?: string): RunnableNodeConfig<TInputJson, TOutputJson>;
  register(context: { registerNode<TValue>(token: TypeToken<TValue>, implementation?: TypeToken<TValue>): void }): void;
}

/**
 * Plugin / DSL-friendly node: per-item `execute` with optional {@link RunnableNodeConfig.inputSchema}.
 */
export interface DefineNodeOptions<
  TKey extends string,
  TConfig extends CredentialJsonRecord,
  TInputJson,
  TOutputJson,
  TBindings extends DefinedNodeCredentialBindings | undefined = undefined,
> {
  readonly key: TKey;
  readonly title: string;
  readonly description?: string;
  /**
   * Canvas icon for this node (same contract as `NodeConfigBase.icon` on runnable configs).
   * The Next host resolves Lucide (`lucide:…`), built-in SVGs (`builtin:…`), Simple Icons (`si:…`), and image URLs (`https:`, `data:`, `/…`).
   */
  readonly icon?: string;
  /** Default values / form hints for **static** node configuration (credentials, retry, IDs), not per-item payload. */
  readonly input?: Readonly<Record<keyof TConfig & string, unknown>>;
  readonly configSchema?: z.ZodType<TConfig>;
  readonly credentials?: TBindings;
  /**
   * Validates **`input`** (engine also accepts `inputSchema` on the node class).
   */
  readonly inputSchema?: ZodType<TInputJson>;
  /** Preserve inbound `item.binary` when `execute` returns plain JSON or item-shaped results without `binary`. */
  readonly keepBinaries?: boolean;
  execute(
    args: DefineNodeExecuteArgs<TConfig, TInputJson>,
    context: DefinedNodeRunContext<TConfig, TBindings>,
  ): MaybePromise<TOutputJson>;
}

/**
 * Batch-oriented defined node: `run` receives all item JSON once (last item in activation); emits one output per input row.
 */
export interface DefineBatchNodeOptions<
  TKey extends string,
  TConfig extends CredentialJsonRecord,
  TInputJson,
  TOutputJson,
  TBindings extends DefinedNodeCredentialBindings | undefined = undefined,
> {
  readonly key: TKey;
  readonly title: string;
  readonly description?: string;
  readonly icon?: string;
  readonly input?: Readonly<Record<keyof TConfig & string, unknown>>;
  readonly configSchema?: z.ZodType<TConfig>;
  readonly credentials?: TBindings;
  run(
    items: ReadonlyArray<TInputJson>,
    context: DefinedNodeRunContext<TConfig, TBindings>,
  ): MaybePromise<ReadonlyArray<TOutputJson>>;
}

const definedNodeCredentialRequirementFactory = {
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

const definedNodeCredentialAccessorFactory = {
  create<TBindings extends DefinedNodeCredentialBindings | undefined>(
    bindings: TBindings,
    ctx: NodeExecutionContext<RunnableNodeConfig<any, any>>,
  ): DefinedNodeCredentialAccessors<TBindings> {
    if (!bindings) {
      return {} as DefinedNodeCredentialAccessors<TBindings>;
    }
    const entries = Object.keys(bindings).map((slotKey) => [slotKey, () => ctx.getCredential(slotKey)] as const);
    return Object.fromEntries(entries) as DefinedNodeCredentialAccessors<TBindings>;
  },
} as const;

export function defineNode<
  TKey extends string,
  TConfig extends CredentialJsonRecord,
  TInputJson,
  TOutputJson,
  TBindings extends DefinedNodeCredentialBindings | undefined = undefined,
>(
  options: DefineNodeOptions<TKey, TConfig, TInputJson, TOutputJson, TBindings>,
): DefinedNode<TKey, TConfig, TInputJson, TOutputJson, TBindings> {
  const credentialRequirements = definedNodeCredentialRequirementFactory.create(options.credentials);
  type DefinedRunnableNodeConfigShape = RunnableNodeConfig<TInputJson, TOutputJson> & Readonly<{ config: TConfig }>;

  const DefinedNodeRuntime = class implements RunnableNode<DefinedRunnableNodeConfigShape, TInputJson, TOutputJson> {
    readonly kind = "node" as const;
    readonly outputPorts = ["main"] as const;
    readonly inputSchema = options.inputSchema;

    async execute(
      args: Readonly<RunnableNodeExecuteArgs<DefinedRunnableNodeConfigShape, TInputJson>>,
    ): Promise<unknown> {
      const ctx = args.ctx;
      const context: DefinedNodeRunContext<TConfig, TBindings> = {
        config: ctx.config.config,
        credentials: definedNodeCredentialAccessorFactory.create(
          options.credentials,
          ctx,
        ) as DefinedNodeCredentialAccessors<TBindings>,
        execution: ctx as unknown as NodeExecutionContext<RunnableNodeConfig<TConfig, unknown>>,
      };
      const payload: DefineNodeExecuteArgs<TConfig, TInputJson> = {
        input: args.input,
        item: args.item,
        itemIndex: args.itemIndex,
        items: args.items,
        ctx,
      };
      return await options.execute(payload, context);
    }
  };

  persistedNode({ name: options.key })(DefinedNodeRuntime);

  const DefinedRunnableNodeConfig = class implements RunnableNodeConfig<TInputJson, TOutputJson> {
    readonly kind = "node" as const;
    readonly type: TypeToken<unknown> = DefinedNodeRuntime;
    readonly icon = options.icon;
    readonly inputSchema = options.inputSchema;
    readonly keepBinaries = options.keepBinaries ?? false;

    constructor(
      public readonly name: string,
      public readonly config: TConfig,
      public readonly id?: string,
    ) {}

    getCredentialRequirements(): ReadonlyArray<CredentialRequirement> {
      return credentialRequirements;
    }
  };

  const definition: DefinedNode<TKey, TConfig, TInputJson, TOutputJson, TBindings> = {
    kind: "defined-node",
    key: options.key,
    title: options.title,
    description: options.description,
    create(config, name = options.title, id) {
      return new DefinedRunnableNodeConfig(name, config, id);
    },
    register(context) {
      context.registerNode(DefinedNodeRuntime);
    },
  };

  DefinedNodeRegistry.register(definition as DefinedNode<string, Record<string, unknown>, unknown, unknown, undefined>);

  return definition;
}

export function defineBatchNode<
  TKey extends string,
  TConfig extends CredentialJsonRecord,
  TInputJson,
  TOutputJson,
  TBindings extends DefinedNodeCredentialBindings | undefined = undefined,
>(
  options: DefineBatchNodeOptions<TKey, TConfig, TInputJson, TOutputJson, TBindings>,
): DefinedNode<TKey, TConfig, TInputJson, TOutputJson, TBindings> {
  const credentialRequirements = definedNodeCredentialRequirementFactory.create(options.credentials);
  type DefinedRunnableNodeConfigShape = RunnableNodeConfig<TInputJson, TOutputJson> & Readonly<{ config: TConfig }>;

  const DefinedNodeRuntime = class implements RunnableNode<DefinedRunnableNodeConfigShape, TInputJson, TOutputJson> {
    readonly kind = "node" as const;
    readonly outputPorts = ["main"] as const;

    async execute(
      args: Readonly<RunnableNodeExecuteArgs<DefinedRunnableNodeConfigShape, TInputJson>>,
    ): Promise<unknown> {
      if (args.itemIndex !== args.items.length - 1) {
        return [];
      }
      const ctx = args.ctx;
      const context: DefinedNodeRunContext<TConfig, TBindings> = {
        config: ctx.config.config,
        credentials: definedNodeCredentialAccessorFactory.create(
          options.credentials,
          ctx,
        ) as DefinedNodeCredentialAccessors<TBindings>,
        execution: ctx as unknown as NodeExecutionContext<RunnableNodeConfig<TConfig, unknown>>,
      };
      const outputs = await options.run(
        args.items.map((item) => item.json as TInputJson),
        context,
      );
      return [...outputs];
    }
  };

  persistedNode({ name: options.key })(DefinedNodeRuntime);

  const DefinedRunnableNodeConfig = class implements RunnableNodeConfig<TInputJson, TOutputJson> {
    readonly kind = "node" as const;
    readonly type: TypeToken<unknown> = DefinedNodeRuntime;
    readonly icon = options.icon;

    constructor(
      public readonly name: string,
      public readonly config: TConfig,
      public readonly id?: string,
    ) {}

    getCredentialRequirements(): ReadonlyArray<CredentialRequirement> {
      return credentialRequirements;
    }
  };

  const definition: DefinedNode<TKey, TConfig, TInputJson, TOutputJson, TBindings> = {
    kind: "defined-node",
    key: options.key,
    title: options.title,
    description: options.description,
    create(config, name = options.title, id) {
      return new DefinedRunnableNodeConfig(name, config, id);
    },
    register(context) {
      context.registerNode(DefinedNodeRuntime);
    },
  };

  DefinedNodeRegistry.register(definition as DefinedNode<string, Record<string, unknown>, unknown, unknown, undefined>);

  return definition;
}
