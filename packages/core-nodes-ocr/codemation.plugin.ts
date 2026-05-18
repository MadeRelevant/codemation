import { defineCodemationApp, definePlugin } from "@codemation/host/authoring";
import { azureContentUnderstandingCredentialType } from "./src/credentials/azureContentUnderstandingCredential";
import { analyzeDocumentNode } from "./src/nodes/analyzeDocumentNode";
import { analyzeImageNode } from "./src/nodes/analyzeImageNode";
import { analyzeInvoiceNode } from "./src/nodes/analyzeInvoiceNode";

const plugin = definePlugin({
  credentials: [azureContentUnderstandingCredentialType],
  nodes: [analyzeInvoiceNode, analyzeDocumentNode, analyzeImageNode],
  sandbox: defineCodemationApp({
    name: "Azure OCR plugin sandbox",
    auth: {
      kind: "local",
      allowUnauthenticatedInDevelopment: true,
    },
    database: {
      kind: "sqlite",
      filePath: ".codemation/codemation.sqlite",
    },
    execution: {
      mode: "inline",
    },
    workflowDiscovery: { directories: ["./dev/workflows"] },
  }),
});

export default plugin;
