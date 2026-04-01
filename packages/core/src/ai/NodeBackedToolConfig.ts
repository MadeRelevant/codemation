import type { CredentialRequirement } from "../contracts/credentialTypes";
import type { TypeToken } from "../di";
import type { Item, NodeOutputs, RunnableNodeConfig, RunnableNodeInputJson } from "../types";
import type { input as ZodInput, output as ZodOutput } from "zod";
import type {
  AgentCanvasPresentation,
  NodeBackedToolConfigOptions,
  NodeBackedToolInputMapper,
  NodeBackedToolInputMapperArgs,
  NodeBackedToolOutputMapper,
  NodeBackedToolOutputMapperArgs,
  ToolConfig,
  ZodSchemaAny,
} from "./AiHost";

export class NodeBackedToolConfig<
  TNodeConfig extends RunnableNodeConfig<any, any>,
  TInputSchema extends ZodSchemaAny,
  TOutputSchema extends ZodSchemaAny,
> implements ToolConfig {
  readonly type: TypeToken<unknown>;
  readonly toolKind = "nodeBacked" as const;
  readonly description?: string;
  readonly presentation?: AgentCanvasPresentation;
  private readonly inputSchemaValue: TInputSchema;
  private readonly outputSchemaValue: TOutputSchema;
  private readonly mapInputValue?: NodeBackedToolInputMapper<TNodeConfig, ZodInput<TInputSchema>>;
  private readonly mapOutputValue?: NodeBackedToolOutputMapper<
    TNodeConfig,
    ZodInput<TInputSchema>,
    ZodOutput<TOutputSchema>
  >;

  constructor(
    public readonly name: string,
    public readonly node: TNodeConfig,
    options: NodeBackedToolConfigOptions<TNodeConfig, TInputSchema, TOutputSchema>,
  ) {
    this.type = node.type;
    this.description = options.description;
    this.presentation = options.presentation;
    this.inputSchemaValue = options.inputSchema;
    this.outputSchemaValue = options.outputSchema;
    this.mapInputValue = options.mapInput;
    this.mapOutputValue = options.mapOutput;
  }

  getCredentialRequirements(): ReadonlyArray<CredentialRequirement> {
    return this.node.getCredentialRequirements?.() ?? [];
  }

  getInputSchema(): TInputSchema {
    return this.inputSchemaValue;
  }

  getOutputSchema(): TOutputSchema {
    return this.outputSchemaValue;
  }

  toNodeItem(
    args: NodeBackedToolInputMapperArgs<TNodeConfig, ZodInput<TInputSchema>>,
  ): Item<RunnableNodeInputJson<TNodeConfig>> {
    const mapped = this.mapInputValue?.(args) ?? (args.input as RunnableNodeInputJson<TNodeConfig>);
    if (this.isItem(mapped)) {
      return mapped;
    }
    return { json: mapped };
  }

  toToolOutput(args: NodeBackedToolOutputMapperArgs<TNodeConfig, ZodInput<TInputSchema>>): ZodOutput<TOutputSchema> {
    const raw = this.mapOutputValue?.(args) ?? this.readDefaultToolOutput(args.outputs);
    return this.outputSchemaValue.parse(raw) as ZodOutput<TOutputSchema>;
  }

  private readDefaultToolOutput(outputs: NodeOutputs): unknown {
    const firstMainItem = outputs.main?.[0];
    if (!firstMainItem) {
      throw new Error(`Node-backed tool "${this.name}" did not produce a main output item.`);
    }
    return firstMainItem.json;
  }

  private isItem(value: unknown): value is Item {
    return typeof value === "object" && value !== null && "json" in value;
  }
}
