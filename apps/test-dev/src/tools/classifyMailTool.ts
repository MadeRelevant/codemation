import type { AgentCanvasPresentation, Tool, ToolConfig, ToolExecuteArgs } from "@codemation/core";
import type { CanvasIconName } from "@codemation/core-nodes";
import { z } from "zod";

const classifyMailInputSchema = z.object({
  subject: z.string().optional(),
  body: z.string().optional(),
});

const classifyMailOutputSchema = z.object({
  isRfq: z.boolean(),
  reason: z.string(),
});

export class ClassifyMailToolConfig implements ToolConfig {
  readonly token = ClassifyMailTool;

  constructor(
    public readonly name: string,
    public readonly keywords: ReadonlyArray<string>,
    public readonly description = "Classify an email as RFQ (request for quotation) or not.",
    public readonly presentation?: AgentCanvasPresentation<CanvasIconName>,
  ) {}
}

export class ClassifyMailTool implements Tool<ClassifyMailToolConfig, typeof classifyMailInputSchema, typeof classifyMailOutputSchema> {
  readonly defaultDescription = "Classify an email as RFQ (request for quotation) or not.";
  readonly inputSchema = classifyMailInputSchema;
  readonly outputSchema = classifyMailOutputSchema;

  async execute(args: ToolExecuteArgs<ClassifyMailToolConfig, z.input<typeof classifyMailInputSchema>>): Promise<z.output<typeof classifyMailOutputSchema>> {
    const subject = args.input.subject ?? String((args.item.json as any)?.subject ?? "");
    const body = args.input.body ?? String((args.item.json as any)?.body ?? "");
    const haystack = `${subject}\n${body}`.toUpperCase();
    const keywords = args.config.keywords.map((keyword) => keyword.toUpperCase());
    const matchedKeyword = keywords.find((keyword) => haystack.includes(keyword));
    const isRfq = matchedKeyword !== undefined;

    // mock a delay
    await new Promise((resolve) => setTimeout(resolve, 2000));

    return {
      isRfq,
      reason: isRfq ? `Contains RFQ language via keyword: ${matchedKeyword}` : "No RFQ/quote language detected",
    };
  }
}

