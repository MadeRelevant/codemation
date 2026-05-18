import { defineNode } from "@codemation/core";
import type { AzureContentUnderstandingSession } from "../credentials/azureContentUnderstandingCredential";
import { azureContentUnderstandingCredentialType } from "../credentials/azureContentUnderstandingCredential";
import { analyzeWithAzure } from "../lib/analyzeWithAzure";
import { readBinaryBody } from "../lib/readBinaryBody";

/** Azure Content Understanding prebuilt invoice analyzer ID. */
const PREBUILT_INVOICE_ANALYZER_ID = "prebuilt-invoice";

export type AnalyzeInvoiceConfig = Readonly<{
  /** Key on `item.binary` that holds the document bytes. Default: `"data"`. */
  binaryField?: string;
  /** MIME type override sent to the analyzer. Falls back to attachment `mimeType` when not set. */
  contentType?: string;
  /** Max bytes the attachment may have before reading. Defaults to 50 MiB. */
  maxBytes?: number;
}>;

export const analyzeInvoiceNode = defineNode({
  key: "azure-ocr.analyze-invoice",
  title: "Analyze Invoice",
  description:
    "Runs the Azure Content Understanding prebuilt invoice analyzer on a binary attachment and returns markdown text plus structured fields.",
  icon: "lucide:receipt",
  input: {
    binaryField: "data",
    contentType: undefined as string | undefined,
    maxBytes: undefined as number | undefined,
  },
  credentials: {
    contentUnderstanding: {
      type: azureContentUnderstandingCredentialType as import("@codemation/core").AnyCredentialType,
      label: "Azure Content Understanding",
      helpText: "Bind an Azure Content Understanding credential (endpoint + key).",
    },
  },
  inspectorSummary({ config }) {
    const cfg = config as unknown as AnalyzeInvoiceConfig;
    const rows = [{ label: "Analyzer", value: "Invoice (prebuilt)" }];
    const binaryField = cfg.binaryField ?? "data";
    if (binaryField !== "data") {
      rows.push({ label: "Binary field", value: binaryField });
    }
    if (cfg.contentType) {
      rows.push({ label: "Content type", value: cfg.contentType });
    }
    return rows;
  },
  async execute({ item, ctx }, { config: rawConfig, credentials }) {
    const config = rawConfig as unknown as AnalyzeInvoiceConfig;
    const session = (await credentials.contentUnderstanding()) as AzureContentUnderstandingSession;
    const binaryField = config.binaryField ?? "data";
    const attachment = item.binary?.[binaryField];
    if (!attachment) {
      throw new Error(`Analyze Invoice: no binary attachment at key "${binaryField}".`);
    }
    const contentType = config.contentType ?? attachment.mimeType ?? "application/octet-stream";
    const body = await readBinaryBody(ctx, attachment, config.maxBytes);
    return analyzeWithAzure({ session, analyzerId: PREBUILT_INVOICE_ANALYZER_ID, body, contentType });
  },
});
