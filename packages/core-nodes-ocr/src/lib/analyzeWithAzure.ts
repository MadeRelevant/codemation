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
import type { AzureContentUnderstandingSession } from "../credentials/azureContentUnderstandingCredential";

/** Structured analyzer fields: scalars at leaves; nested objects and arrays preserved. */
export type OcrStructuredFields = Readonly<Record<string, unknown>>;

/** The output shape returned by all OCR analyzer nodes. */
export type OcrAnalysisOutput = Readonly<{
  /** Markdown representation of the document content. */
  content: string;
  /** Structured fields extracted by the prebuilt analyzer. */
  fields: OcrStructuredFields;
}>;

/**
 * Analyzes a binary document using an Azure Content Understanding prebuilt analyzer.
 * Retries on transient failures are handled by the engine via the node's `retryPolicy`.
 */
export async function analyzeWithAzure(
  args: Readonly<{
    session: AzureContentUnderstandingSession;
    analyzerId: string;
    body: Uint8Array;
    contentType: string;
  }>,
): Promise<OcrAnalysisOutput> {
  const client = new ContentUnderstandingClient(args.session.endpoint, new AzureKeyCredential(args.session.apiKey));
  const poller = client.analyzeBinary(args.analyzerId, args.body, args.contentType);
  const result = await poller.pollUntilDone();
  return mapAnalysisResult(result);
}

/** @internal Exported for testing — maps a raw AnalysisResult to the node output shape. */
export function mapAnalysisResult(result: AnalysisResult): OcrAnalysisOutput {
  const contents = result.contents ?? [];
  const markdownParts: string[] = [];
  for (const c of contents) {
    if (typeof c.markdown === "string" && c.markdown.length > 0) {
      markdownParts.push(c.markdown);
    }
  }
  const content = markdownParts.join("\n\n");
  if (contents.length === 0) {
    return { content: "", fields: {} };
  }
  if (contents.length === 1) {
    const c = contents[0]!;
    return {
      content,
      fields: c.fields ? fieldsToStructuredMap(c.fields) : {},
    };
  }
  return {
    content,
    fields: {
      segments: contents.map((c, index) => ({
        index,
        markdown: typeof c.markdown === "string" && c.markdown.trim().length > 0 ? c.markdown : undefined,
        fields: c.fields ? fieldsToStructuredMap(c.fields) : {},
      })),
    },
  };
}

function fieldsToStructuredMap(fields: Readonly<Record<string, ContentFieldUnion>>): OcrStructuredFields {
  const out: Record<string, unknown> = {};
  for (const [name, field] of Object.entries(fields)) {
    out[name] = fieldToStructuredValue(field);
  }
  return out;
}

function fieldToStructuredValue(field: ContentFieldUnion): unknown {
  const kind = resolveFieldKind(field);
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
      return values.map((element) => fieldToStructuredValue(element));
    }
    case "object": {
      const properties = (field as ObjectField).value ?? {};
      return fieldsToStructuredMap(properties);
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

function resolveFieldKind(field: ContentFieldUnion): string {
  if ("fieldType" in field && typeof field.fieldType === "string") {
    return field.fieldType;
  }
  return (field as ContentField).type;
}
