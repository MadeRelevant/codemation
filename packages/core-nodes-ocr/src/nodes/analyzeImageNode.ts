import { defineNode } from "@codemation/core";
import type { AzureContentUnderstandingSession } from "../credentials/azureContentUnderstandingCredential";
import { azureContentUnderstandingCredentialType } from "../credentials/azureContentUnderstandingCredential";
import { analyzeWithAzure } from "../lib/analyzeWithAzure";
import { readBinaryBody } from "../lib/readBinaryBody";

/** Default Azure Content Understanding prebuilt image analyzer ID. */
const DEFAULT_IMAGE_ANALYZER_ID = "prebuilt-imageAnalyzer";

export type AnalyzeImageConfig = Readonly<{
  /** Key on `item.binary` that holds the image bytes. Default: `"data"`. */
  binaryField?: string;
  /** MIME type override sent to the analyzer. Falls back to attachment `mimeType` when not set. */
  contentType?: string;
  /**
   * Azure Content Understanding analyzer ID to use.
   * Defaults to `"prebuilt-imageAnalyzer"`. Set this to a custom analyzer ID when you have
   * a trained model or need a different prebuilt variant.
   */
  analyzerId?: string;
  /** Max bytes the attachment may have before reading. Defaults to 50 MiB. */
  maxBytes?: number;
}>;

export const analyzeImageNode = defineNode({
  key: "azure-ocr.analyze-image",
  title: "Analyze Image",
  description:
    "Runs an Azure Content Understanding image analyzer on a binary attachment and returns markdown text plus structured fields. Defaults to the prebuilt image analyzer.",
  icon: "lucide:image-search",
  input: {
    binaryField: "data",
    contentType: undefined as string | undefined,
    analyzerId: undefined as string | undefined,
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
    const cfg = config as unknown as AnalyzeImageConfig;
    const analyzerId = cfg.analyzerId ?? DEFAULT_IMAGE_ANALYZER_ID;
    const rows = [{ label: "Analyzer", value: analyzerId }];
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
    const config = rawConfig as unknown as AnalyzeImageConfig;
    const session = (await credentials.contentUnderstanding()) as AzureContentUnderstandingSession;
    const binaryField = config.binaryField ?? "data";
    const attachment = item.binary?.[binaryField];
    if (!attachment) {
      throw new Error(`Analyze Image: no binary attachment at key "${binaryField}".`);
    }
    const analyzerId = config.analyzerId ?? DEFAULT_IMAGE_ANALYZER_ID;
    const contentType = config.contentType ?? attachment.mimeType ?? "application/octet-stream";
    const body = await readBinaryBody(ctx, attachment, config.maxBytes);
    return analyzeWithAzure({ session, analyzerId, body, contentType });
  },
});
