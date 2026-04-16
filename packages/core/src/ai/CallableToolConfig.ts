import type { CredentialRequirement } from "../contracts/credentialTypes";
import type { TypeToken } from "../di";
import type { AgentCanvasPresentation, ToolConfig, ToolExecuteArgs, ZodSchemaAny } from "./AiHost";
import { ZodError, type input as ZodInput, type output as ZodOutput } from "zod";

import { CallableToolKindToken } from "./CallableToolKindToken";

export type CallableToolExecuteHandler<TInputSchema extends ZodSchemaAny, TOutputSchema extends ZodSchemaAny> = (
  args: ToolExecuteArgs<CallableToolConfig<TInputSchema, TOutputSchema>, ZodInput<TInputSchema>>,
) => Promise<ZodOutput<TOutputSchema>> | ZodOutput<TOutputSchema>;

export type CallableToolConfigOptions<
  TInputSchema extends ZodSchemaAny,
  TOutputSchema extends ZodSchemaAny,
> = Readonly<{
  name: string;
  description?: string;
  presentation?: AgentCanvasPresentation;
  inputSchema: TInputSchema;
  outputSchema: TOutputSchema;
  /**
   * Optional credential slots for this tool (same contract as other {@link ToolConfig} shapes).
   */
  credentialRequirements?: ReadonlyArray<CredentialRequirement>;
  execute: CallableToolExecuteHandler<TInputSchema, TOutputSchema>;
}>;

/**
 * Inline callable agent tool: DSL sugar over {@link ToolConfig} without a separate {@link NodeResolver}-registered {@link Tool} class.
 */
export class CallableToolConfig<
  TInputSchema extends ZodSchemaAny,
  TOutputSchema extends ZodSchemaAny,
> implements ToolConfig {
  readonly type: TypeToken<unknown> = CallableToolKindToken;
  readonly toolKind = "callable" as const;
  readonly description?: string;
  readonly presentation?: AgentCanvasPresentation;
  private readonly inputSchemaValue: TInputSchema;
  private readonly outputSchemaValue: TOutputSchema;
  private readonly credentialRequirementsValue?: ReadonlyArray<CredentialRequirement>;
  private readonly executeHandler: CallableToolExecuteHandler<TInputSchema, TOutputSchema>;

  constructor(
    public readonly name: string,
    options: CallableToolConfigOptions<TInputSchema, TOutputSchema>,
  ) {
    this.description = options.description;
    this.presentation = options.presentation;
    this.inputSchemaValue = options.inputSchema;
    this.outputSchemaValue = options.outputSchema;
    this.credentialRequirementsValue = options.credentialRequirements;
    this.executeHandler = options.execute;
  }

  getCredentialRequirements(): ReadonlyArray<CredentialRequirement> {
    return this.credentialRequirementsValue ?? [];
  }

  getInputSchema(): TInputSchema {
    return this.inputSchemaValue;
  }

  getOutputSchema(): TOutputSchema {
    return this.outputSchemaValue;
  }

  /**
   * Parses tool input and output with the configured Zod schemas.
   */
  async executeTool(
    args: ToolExecuteArgs<CallableToolConfig<TInputSchema, TOutputSchema>, ZodInput<TInputSchema>>,
  ): Promise<ZodOutput<TOutputSchema>> {
    const parsedInput = this.parseInput(args.input);
    const raw = await Promise.resolve(
      this.executeHandler({
        ...args,
        config: this,
        input: parsedInput,
      }),
    );
    return this.parseOutput(raw);
  }

  private parseInput(input: unknown): ZodInput<TInputSchema> {
    try {
      return this.inputSchemaValue.parse(input) as ZodInput<TInputSchema>;
    } catch (error) {
      throw this.decorateValidationError(error, "input");
    }
  }

  private parseOutput(output: unknown): ZodOutput<TOutputSchema> {
    try {
      return this.outputSchemaValue.parse(output) as ZodOutput<TOutputSchema>;
    } catch (error) {
      throw this.decorateValidationError(error, "output");
    }
  }

  private decorateValidationError(error: unknown, stage: "input" | "output"): Error {
    if (error instanceof ZodError) {
      (error as ZodError & { codemationToolValidationStage?: "input" | "output" }).codemationToolValidationStage =
        stage;
      return error;
    }
    return error instanceof Error ? error : new Error(String(error));
  }
}
