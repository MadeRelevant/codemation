import { definePlugin, type CodemationConfig } from "@codemation/host/authoring";
import type { McpServerDeclaration } from "@codemation/core";
import { GmailNodes } from "./src/plugin/GmailNodesRegistry";

const sandbox: CodemationConfig = {
  app: {
    auth: {
      kind: "local",
      allowUnauthenticatedInDevelopment: true,
    },
    database: {
      kind: "sqlite",
      sqliteFilePath: ".codemation/codemation.sqlite",
    },
    scheduler: {
      kind: "inline",
    },
    whitelabel: {
      productName: "Gmail plugin sandbox",
    },
  },
  workflowDiscovery: { directories: ["./dev/workflows"] },
};

const gmailMcpServer: McpServerDeclaration = {
  id: "gmail",
  displayName: "Gmail",
  description: "Gmail via MCP — search, send, label.",
  transport: "http",
  url: process.env["GMAIL_MCP_URL"] ?? "https://gmailmcp.googleapis.com/mcp/v1",
  credentialKind: "oauth2-via-broker",
  oauthAppKey: "google-mail",
  credentialTypeId: "host.oauth2-via-broker",
  requiredScopes: [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.modify",
  ],
  staticHeaders: {},
  toolDescriptionOverrides: {},
};

const plugin = definePlugin({
  register: async (context) => {
    await new GmailNodes().register(context);
  },
  sandbox,
  mcpServers: [gmailMcpServer],
});

export default plugin;
