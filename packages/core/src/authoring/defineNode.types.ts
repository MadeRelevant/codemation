import type {
  AnyCredentialType,
  CredentialJsonRecord,
  CredentialRequirement,
  CredentialTypeId,
} from "../contracts/credentialTypes";
import type { ItemNode, Node, NodeExecutionContext } from "../contracts/runtimeTypes";
import type { Item, ItemInputMapper, Items, NodeOutputs, RunnableNodeConfig } from "../contracts/workflowTypes";
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
 * Arguments for {@link defineNode} `executeOne` (engine `ctx` matches {@link ItemNode.executeOne};
 * the second callback parameter adds {@link DefinedNodeRunContext} for credential accessors).
 */
export type DefineNodeExecuteOneArgs<TConfig extends CredentialJsonRecord, TInputJson, TWireJson> = Readonly<{
  input: TInputJson;
  item: Item;
  itemIndex: number;
  items: Items;
  ctx: NodeExecutionContext<RunnableNodeConfig<TInputJson, unknown, TWireJson> & Readonly<{ config: TConfig }>>;
}>;

export interface DefinedNode<
  TKey extends string,
  TConfig extends CredentialJsonRecord,
  TInputJson,
  TOutputJson,
  _TBindings extends DefinedNodeCredentialBindings | undefined = undefined,
  TWireJson = TInputJson,
> {
  readonly kind: "defined-node";
  readonly key: TKey;
  readonly title: string;
  readonly description?: string;
  create(config: TConfig, name?: string, id?: string): RunnableNodeConfig<TInputJson, TOutputJson, TWireJson>;
  register(context: { registerNode<TValue>(token: TypeToken<TValue>, implementation?: TypeToken<TValue>): void }): void;
}

/**
 * Plugin / DSL-friendly node: **one item in, one item out** per engine activation step.
 * The engine applies {@link RunnableNodeConfig.mapInput} (if any) + {@link RunnableNodeConfig.inputSchema}
 * before `executeOne`. Use {@link defineBatchNode} for legacy batch `run(items, …)` semantics.
 */
export interface DefineNodeOptions<
  TKey extends string,
  TConfig extends CredentialJsonRecord,
  TInputJson,
  TOutputJson,
  TBindings extends DefinedNodeCredentialBindings | undefined = undefined,
  TWireJson = TInputJson,
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
   * Validates **`input`** after optional {@link mapInput} (engine also accepts `inputSchema` on the node class).
   */
  readonly inputSchema?: ZodType<TInputJson>;
  /**
   * Maps wire JSON (`item.json` from upstream) to execute input before validation.
   */
  readonly mapInput?: ItemInputMapper<TWireJson, TInputJson>;
  executeOne(
    args: DefineNodeExecuteOneArgs<TConfig, TInputJson, TWireJson>,
    context: DefinedNodeRunContext<TConfig, TBindings>,
  ): MaybePromise<TOutputJson>;
}

/**
 * Batch-oriented defined node (legacy): receives all items at once via `run`.
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
    ctx: NodeExecutionContext<RunnableNodeConfig<any, any, any>>,
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
  TWireJson = TInputJson,
>(
  options: DefineNodeOptions<TKey, TConfig, TInputJson, TOutputJson, TBindings, TWireJson>,
): DefinedNode<TKey, TConfig, TInputJson, TOutputJson, TBindings, TWireJson> {
  const credentialRequirements = definedNodeCredentialRequirementFactory.create(options.credentials);
  type DefinedRunnableNodeConfigShape = RunnableNodeConfig<TInputJson, TOutputJson, TWireJson> &
    Readonly<{ config: TConfig }>;

  const DefinedNodeRuntime = class implements ItemNode<DefinedRunnableNodeConfigShape, TInputJson, TOutputJson> {
    readonly kind = "node" as const;
    readonly outputPorts = ["main"] as const;
    readonly inputSchema = options.inputSchema;

    async executeOne(
      args: Readonly<{
        input: TInputJson;
        item: Item;
        itemIndex: number;
        items: Items;
        ctx: NodeExecutionContext<DefinedRunnableNodeConfigShape>;
      }>,
    ): Promise<TOutputJson> {
      const ctx = args.ctx;
      const context: DefinedNodeRunContext<TConfig, TBindings> = {
        config: ctx.config.config,
        credentials: definedNodeCredentialAccessorFactory.create(
          options.credentials,
          ctx,
        ) as DefinedNodeCredentialAccessors<TBindings>,
        execution: ctx as unknown as NodeExecutionContext<RunnableNodeConfig<TConfig, unknown>>,
      };
      const payload: DefineNodeExecuteOneArgs<TConfig, TInputJson, TWireJson> = {
        input: args.input,
        item: args.item,
        itemIndex: args.itemIndex,
        items: args.items,
        ctx,
      };
      return await options.executeOne(payload, context);
    }
  };

  persistedNode({ name: options.key })(DefinedNodeRuntime);

  const DefinedRunnableNodeConfig = class implements RunnableNodeConfig<TInputJson, TOutputJson, TWireJson> {
    readonly kind = "node" as const;
    readonly type: TypeToken<unknown> = DefinedNodeRuntime;
    readonly icon = options.icon;
    readonly inputSchema = options.inputSchema;
    readonly mapInput = options.mapInput;

    constructor(
      public readonly name: string,
      public readonly config: TConfig,
      public readonly id?: string,
    ) {}

    getCredentialRequirements(): ReadonlyArray<CredentialRequirement> {
      return credentialRequirements;
    }
  };

  const definition: DefinedNode<TKey, TConfig, TInputJson, TOutputJson, TBindings, TWireJson> = {
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

  DefinedNodeRegistry.register(
    definition as DefinedNode<string, Record<string, unknown>, unknown, unknown, undefined, unknown>,
  );

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
): DefinedNode<TKey, TConfig, TInputJson, TOutputJson, TBindings, TInputJson> {
  const credentialRequirements = definedNodeCredentialRequirementFactory.create(options.credentials);
  type DefinedRunnableNodeConfigShape = RunnableNodeConfig<TInputJson, TOutputJson, TInputJson> &
    Readonly<{ config: TConfig }>;

  const DefinedNodeRuntime = class implements Node<DefinedRunnableNodeConfigShape> {
    readonly kind = "node" as const;
    readonly outputPorts = ["main"] as const;

    async execute(items: Items, ctx: NodeExecutionContext<DefinedRunnableNodeConfigShape>): Promise<NodeOutputs> {
      const outputs = await options.run(
        items.map((item) => item.json as TInputJson),
        {
          config: ctx.config.config,
          credentials: definedNodeCredentialAccessorFactory.create(
            options.credentials,
            ctx,
          ) as DefinedNodeCredentialAccessors<TBindings>,
          execution: ctx as unknown as NodeExecutionContext<RunnableNodeConfig<TConfig, unknown>>,
        },
      );

      return {
        main: outputs.map((json, index) => {
          const existing = items[index];
          if (!existing) {
            return { json };
          }
          return { ...existing, json };
        }),
      };
    }
  };

  persistedNode({ name: options.key })(DefinedNodeRuntime);

  const DefinedRunnableNodeConfig = class implements RunnableNodeConfig<TInputJson, TOutputJson, TInputJson> {
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

  const definition: DefinedNode<TKey, TConfig, TInputJson, TOutputJson, TBindings, TInputJson> = {
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

  DefinedNodeRegistry.register(
    definition as DefinedNode<string, Record<string, unknown>, unknown, unknown, undefined, unknown>,
  );

  return definition;
}
