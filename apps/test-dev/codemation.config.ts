import type { CredentialType } from "@codemation/core";
import type { CodemationAppSlots, CodemationConfig } from "@codemation/host";
import { openAiApiKeyCredentialType } from "@codemation/host/credentials";
import { config as loadDotenv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MailKeywordCatalog } from "./src/MailKeywordCatalog";
import { OdooDemoSettings } from "./src/OdooDemoSettings";
import { TestDevLogo } from "./src/ui/testDevLogo";
import { TestDevNavigation } from "./src/ui/testDevNavigation";

loadDotenv({
  path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".env"),
  quiet: true,
});

const useRedisRuntime = Boolean(process.env.REDIS_URL);
const databaseUrl = process.env.DATABASE_URL?.trim();

type AzureFoundryPublicConfig = Readonly<{ endpoint?: string }>;
type AzureFoundryMaterial = Readonly<{ apiKey?: string }>;
type AzureFoundrySession = Readonly<{ endpoint: string; apiKey: string }>;

type OdooDemoPublicConfig = Readonly<{ baseUrl?: string }>;
type OdooDemoMaterial = Readonly<{ apiKey?: string }>;
type OdooDemoSession = Readonly<{ baseUrl: string; apiKey: string }>;

const azureFoundryContentUnderstandingCredentialType = {
  definition: {
    typeId: "azureFoundry.contentUnderstandingApiKey",
    displayName: "Azure AI Content Understanding (Foundry)",
    description:
      "Microsoft Foundry resource endpoint and API key for Azure AI Content Understanding (prebuilt analyzers such as prebuilt-invoice).",
    publicFields: [
      {
        key: "endpoint",
        label: "Endpoint",
        type: "string" as const,
        required: true,
        placeholder: "https://your-resource.services.ai.azure.com/",
        helpText: "Microsoft Foundry / Azure AI endpoint (Portal → Keys and Endpoint).",
      },
    ],
    secretFields: [{ key: "apiKey", label: "API key", type: "password" as const, required: true }],
    supportedSourceKinds: ["db", "env", "code"] as const,
  },
  createSession: async (args) => {
    const endpoint = String(args.publicConfig.endpoint ?? "")
      .trim()
      .replace(/\/+$/, "");
    return {
      endpoint,
      apiKey: String(args.material.apiKey ?? ""),
    };
  },
  test: async (args) => {
    const endpoint = String(args.publicConfig.endpoint ?? "").trim();
    const apiKey = String(args.material.apiKey ?? "").trim();
    if (endpoint.length === 0 || apiKey.length === 0) {
      return {
        status: "failing" as const,
        message: "Endpoint and API key are required.",
        testedAt: new Date().toISOString(),
      };
    }
    return {
      status: "healthy" as const,
      message: "Azure AI Content Understanding credential material is present.",
      testedAt: new Date().toISOString(),
    };
  },
} satisfies CredentialType<AzureFoundryPublicConfig, AzureFoundryMaterial, AzureFoundrySession>;

const odooDemoCredentialType = {
  definition: {
    typeId: "odoo.demo",
    displayName: "Odoo (demo)",
    description: "Demo Odoo API credential for test-dev sample workflows.",
    publicFields: [{ key: "baseUrl", label: "Base URL", type: "string" as const, required: true }],
    secretFields: [{ key: "apiKey", label: "API key", type: "password" as const }],
    supportedSourceKinds: ["db", "env", "code"] as const,
  },
  createSession: async (args) => ({
    baseUrl: String(args.publicConfig.baseUrl ?? ""),
    apiKey: String(args.material.apiKey ?? ""),
  }),
  test: async () => ({
    status: "unknown" as const,
    testedAt: new Date().toISOString(),
  }),
} satisfies CredentialType<OdooDemoPublicConfig, OdooDemoMaterial, OdooDemoSession>;
const slots: CodemationAppSlots = {
  Logo: TestDevLogo,
  Navigation: TestDevNavigation,
};

export const codemationHost = {
  auth: {
    kind: "local" as const,
    allowUnauthenticatedInDevelopment: true,
    oauth: [
      {
        provider: "google",
        clientIdEnv: "GOOGLE_CLIENT_ID",
        clientSecretEnv: "GOOGLE_CLIENT_SECRET",
      },
    ],
  },
  bindings: [
    {
      token: MailKeywordCatalog,
      useValue: new MailKeywordCatalog(["RFQ", "QUOTE", "QUOTATION", "RFP"]),
    },
    {
      token: OdooDemoSettings,
      useValue: new OdooDemoSettings(process.env.ODOO_DEMO_BASE_URL ?? "https://demo.odoo.test"),
    },
  ],
  workflowDiscovery: {
    directories: ["src/workflows"],
  },
  credentialTypes: [openAiApiKeyCredentialType, azureFoundryContentUnderstandingCredentialType, odooDemoCredentialType],
  runtime: {
    database: useRedisRuntime
      ? { kind: "postgresql" as const, url: databaseUrl ?? "" }
      : { kind: "pglite" as const, pgliteDataDir: ".codemation/pglite" },
    scheduler: {
      kind: useRedisRuntime ? "bullmq" : "local",
      queuePrefix: "codemation",
      workerQueues: ["default"],
    },
    eventBus: {
      kind: useRedisRuntime ? "redis" : "memory",
      redisUrl: process.env.REDIS_URL,
      queuePrefix: "codemation",
    },
  },
  slots,
} satisfies CodemationConfig;

export default codemationHost;
