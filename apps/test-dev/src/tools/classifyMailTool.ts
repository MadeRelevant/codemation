import type { AgentTool, AgentToolExecuteArgs } from "@codemation/core";
import { z } from "zod";

const classifyMailInputSchema = z.object({
  subject: z.string().optional(),
  body: z.string().optional(),
});

const classifyMailOutputSchema = z.object({
  isRfq: z.boolean(),
  reason: z.string(),
});

export class ClassifyMailTool implements AgentTool<typeof classifyMailInputSchema, typeof classifyMailOutputSchema> {
  readonly name = "classifyMail";
  readonly description = "Classify an email as RFQ (request for quotation) or not.";

  readonly inputSchema = classifyMailInputSchema;
  readonly outputSchema = classifyMailOutputSchema;

  execute(args: AgentToolExecuteArgs<z.input<typeof classifyMailInputSchema>>): z.output<typeof classifyMailOutputSchema> {
    const subject = args.input.subject ?? String((args.item.json as any)?.subject ?? "");
    const body = args.input.body ?? String((args.item.json as any)?.body ?? "");
    const haystack = `${subject}\n${body}`.toUpperCase();
    const isRfq = haystack.includes("RFQ") || haystack.includes("QUOTE") || haystack.includes("QUOTATION");
    return { isRfq, reason: isRfq ? "Contains RFQ/quote language" : "No RFQ/quote language detected" };
  }
}

