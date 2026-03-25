import type { BinaryAttachment, NodeExecutionContext } from "@codemation/core";

import type {
  AnalysisResult,
  ArrayField,
  BooleanField,
  ContentField,
  ContentFieldUnion,
  DateField,
  IntegerField,
  JsonField,
  NumberField,
  ObjectField,
  StringField,
  TimeField,
} from "@azure/ai-content-understanding";
import { ContentUnderstandingClient } from "@azure/ai-content-understanding";
import { AzureKeyCredential } from "@azure/core-auth";

const prebuiltInvoiceAnalyzerId = "prebuilt-invoice" as const;
const maxAttempts = 5;
const delayMsBetweenFailures = 3000;

/** Structured invoice fields: scalars at leaves; nested objects and arrays preserved (no dot-path flattening). */
export type OcrStructuredFields = Readonly<Record<string, unknown>>;

export type AzureContentUnderstandingSession = Readonly<{
  endpoint: string;
  apiKey: string;
}>;

export class AzureInvoiceOcrConsumer {
  async readBinaryBody(ctx: Pick<NodeExecutionContext, "binary">, attachment: BinaryAttachment): Promise<Uint8Array> {
    const stream = await ctx.binary.openReadStream(attachment);
    if (!stream) {
      throw new Error("Binary attachment stream is unavailable.");
    }
    const reader = stream.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (value) {
        chunks.push(value);
        total += value.byteLength;
      }
    }
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      out.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return out;
  }

  async analyzePrebuiltInvoiceWithRetry(
    args: Readonly<{
      session: AzureContentUnderstandingSession;
      body: Uint8Array;
      contentType: string;
    }>,
  ): Promise<Readonly<{ content: string; fields: OcrStructuredFields }>> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await this.analyzeOnce(args);
      } catch (error) {
        lastError = error;
        if (attempt === maxAttempts) {
          break;
        }
        await this.delay(delayMsBetweenFailures);
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  private async analyzeOnce(
    args: Readonly<{
      session: AzureContentUnderstandingSession;
      body: Uint8Array;
      contentType: string;
    }>,
  ): Promise<Readonly<{ content: string; fields: OcrStructuredFields }>> {
    const client = new ContentUnderstandingClient(args.session.endpoint, new AzureKeyCredential(args.session.apiKey));
    const poller = client.analyzeBinary(prebuiltInvoiceAnalyzerId, args.body, args.contentType);
    const result = await poller.pollUntilDone();
    return this.mapAnalysisResult(result);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  private mapAnalysisResult(result: AnalysisResult): Readonly<{ content: string; fields: OcrStructuredFields }> {
    const contents = result.contents ?? [];
    const markdownParts: string[] = [];
    for (const c of contents) {
      if (typeof c.markdown === "string" && c.markdown.length > 0) {
        markdownParts.push(c.markdown);
      }
    }
    const contentJoined = markdownParts.join("\n\n");
    if (contents.length === 0) {
      return { content: "", fields: {} };
    }
    if (contents.length === 1) {
      const c = contents[0]!;
      return {
        content: contentJoined,
        fields: c.fields ? this.fieldsToStructuredMap(c.fields) : {},
      };
    }
    return {
      content: contentJoined,
      fields: {
        segments: contents.map((c, index) => ({
          index,
          markdown: typeof c.markdown === "string" && c.markdown.trim().length > 0 ? c.markdown : undefined,
          fields: c.fields ? this.fieldsToStructuredMap(c.fields) : {},
        })),
      },
    };
  }

  private fieldsToStructuredMap(fields: Readonly<Record<string, ContentFieldUnion>>): OcrStructuredFields {
    const out: Record<string, unknown> = {};
    for (const [name, field] of Object.entries(fields)) {
      out[name] = this.fieldToStructuredValue(field);
    }
    return out;
  }

  private fieldToStructuredValue(field: ContentFieldUnion): unknown {
    const kind = this.resolveFieldKind(field);
    switch (kind) {
      case "string":
        return (field as StringField).value ?? null;
      case "date": {
        const d = (field as DateField).value;
        return d ? d.toISOString() : null;
      }
      case "time":
        return (field as TimeField).value ?? null;
      case "number":
        return (field as NumberField).value ?? null;
      case "integer":
        return (field as IntegerField).value ?? null;
      case "boolean":
        return (field as BooleanField).value ?? null;
      case "array": {
        const values = (field as ArrayField).value ?? [];
        return values.map((element) => this.fieldToStructuredValue(element));
      }
      case "object": {
        const properties = (field as ObjectField).value ?? {};
        return this.fieldsToStructuredMap(properties);
      }
      case "json":
        return (field as JsonField).value ?? null;
      default: {
        const base = field as ContentField;
        if (base.value === undefined || base.value === null) {
          return null;
        }
        return typeof base.value === "object" ? base.value : String(base.value);
      }
    }
  }

  private resolveFieldKind(field: ContentFieldUnion): string {
    if ("fieldType" in field && typeof field.fieldType === "string") {
      return field.fieldType;
    }
    return (field as ContentField).type;
  }
}
