import type { Tool, ToolExecuteArgs } from "@codemation/core";

import { inject, tool } from "@codemation/core";

import { z } from "zod";

import { MailKeywordCatalog } from "../MailKeywordCatalog";

import type { ClassifyMailToolConfig } from "./ClassifyMailToolConfig";

const classifyMailInputSchema = z.object({
  subject: z.string().optional(),
  body: z.string().optional(),
});

const classifyMailOutputSchema = z.object({
  isRfq: z.boolean(),
  reason: z.string(),
});

@tool()
export class ClassifyMailTool implements Tool<
  ClassifyMailToolConfig,
  typeof classifyMailInputSchema,
  typeof classifyMailOutputSchema
> {
  readonly defaultDescription = "Classify an email as RFQ (request for quotation) or not.";
  readonly inputSchema = classifyMailInputSchema;
  readonly outputSchema = classifyMailOutputSchema;

  constructor(
    @inject(MailKeywordCatalog)
    private readonly mailKeywordCatalog: MailKeywordCatalog,
  ) {}

  async execute(
    args: ToolExecuteArgs<ClassifyMailToolConfig, z.input<typeof classifyMailInputSchema>>,
  ): Promise<z.output<typeof classifyMailOutputSchema>> {
    const subject = args.input.subject ?? String((args.item.json as any)?.subject ?? "");
    const body = args.input.body ?? String((args.item.json as any)?.body ?? "");
    const haystack = `${subject}\n${body}`.toUpperCase();
    const keywords = [...this.mailKeywordCatalog.keywords, ...args.config.keywords].map((keyword) =>
      keyword.toUpperCase(),
    );
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

export { ClassifyMailToolConfig } from "./ClassifyMailToolConfig";
