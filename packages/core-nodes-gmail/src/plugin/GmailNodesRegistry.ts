import type { Container } from "@codemation/core";
import { GmailCredentialTypes } from "../contracts/GmailCredentialTypes";
import type { GmailNodesOptions } from "../contracts/GmailNodesOptions";
import { GmailNodeTokens } from "../contracts/GmailNodeTokens";
import type { GmailOAuthCredential } from "../contracts/GmailOAuthCredential";
import type { GmailServiceAccountCredential } from "../contracts/GmailServiceAccountCredential";
import { GmailPullTriggerRuntime } from "../runtime/GmailPullTriggerRuntime";
import type { GmailApiClient } from "../services/GmailApiClient";
import { GmailConfiguredLabelService } from "../services/GmailConfiguredLabelService";
import { GmailHistorySyncService } from "../services/GmailHistorySyncService";
import { GmailMessageItemMapper } from "../services/GmailMessageItemMapper";
import { GmailQueryMatcher } from "../services/GmailQueryMatcher";
import { GmailTriggerAttachmentService } from "../services/GmailTriggerAttachmentService";
import { GmailTriggerTestItemService } from "../services/GmailTriggerTestItemService";
import { GmailWatchService } from "../services/GmailWatchService";

type PluginContext = Readonly<{
  container: Container;
  application: unknown;
  loggerFactory: Readonly<{
    create(scope: string): Readonly<{
      info(message: string, exception?: Error): void;
      warn(message: string, exception?: Error): void;
      error(message: string, exception?: Error): void;
      debug(message: string, exception?: Error): void;
    }>;
  }>;
  consumerRoot: string;
  repoRoot: string;
  env: Readonly<Record<string, string | undefined>>;
  workflowSources: ReadonlyArray<string>;
}>;

type CredentialTypeRegistrar = Readonly<{
  registerCredentialType(type: Readonly<{
    definition: Readonly<{
      typeId: string;
      displayName: string;
      description?: string;
      publicFields?: ReadonlyArray<
        Readonly<{
          key: string;
          label: string;
          type: string;
          required?: true;
          placeholder?: string;
          helpText?: string;
          envVarName?: string;
        }>
      >;
      secretFields?: ReadonlyArray<
        Readonly<{
          key: string;
          label: string;
          type: string;
          required?: true;
          placeholder?: string;
          helpText?: string;
          envVarName?: string;
        }>
      >;
      supportedSourceKinds?: ReadonlyArray<"db" | "env" | "code">;
        auth?: Readonly<
          | {
              kind: "oauth2";
              providerId: string;
              scopes: ReadonlyArray<string>;
              clientIdFieldKey?: string;
              clientSecretFieldKey?: string;
            }
          | {
              kind: "oauth2";
              providerFromPublicConfig: Readonly<{
                authorizeUrlFieldKey: string;
                tokenUrlFieldKey: string;
                userInfoUrlFieldKey?: string;
              }>;
              scopes: ReadonlyArray<string>;
              clientIdFieldKey?: string;
              clientSecretFieldKey?: string;
            }
        >;
    }>;
    createSession(args: Readonly<{ material: Readonly<Record<string, unknown>>; instance: unknown; publicConfig: Readonly<Record<string, unknown>> }>): Promise<unknown>;
    test(args: Readonly<{ material: Readonly<Record<string, unknown>>; instance: unknown; publicConfig: Readonly<Record<string, unknown>> }>): Promise<Readonly<{ status: "unknown" | "healthy" | "failing"; message?: string; testedAt?: string; expiresAt?: string; details?: Readonly<Record<string, unknown>> }>>;
  }>): void;
}>;

export class GmailNodes {
  readonly pluginPackageId = "@codemation/core-nodes-gmail" as const;

  private readonly options: GmailNodesOptions;

  constructor(options: GmailNodesOptions = {}) {
    this.options = options;
  }

  async register(context: PluginContext): Promise<void> {
    this.registerOptions(context.container);
    this.registerServices(context.container, context);
    this.registerCredentialTypes(context.application);
  }

  private registerOptions(container: Container): void {
    container.registerInstance(GmailNodeTokens.GmailNodesOptions, this.options);
  }

  private registerServices(container: Container, context: PluginContext): void {
    container.registerInstance(GmailNodeTokens.TriggerLogger, context.loggerFactory.create("codemation-gmail.trigger"));
    container.registerInstance(GmailNodeTokens.RuntimeLogger, context.loggerFactory.create("codemation-gmail.runtime"));
    container.register(GmailNodeTokens.GmailApiClient, {
      useFactory: () => {
        throw new Error("GmailApiClient must be supplied by the active Gmail runtime binding.");
      },
    });
    container.register(GmailNodeTokens.GmailPubSubPullClient, {
      useFactory: () => {
        throw new Error("GmailPubSubPullClient must be supplied by the active Gmail runtime binding.");
      },
    });
    container.register(GmailHistorySyncService, { useClass: GmailHistorySyncService });
    container.register(GmailConfiguredLabelService, { useClass: GmailConfiguredLabelService });
    container.register(GmailMessageItemMapper, { useClass: GmailMessageItemMapper });
    container.register(GmailQueryMatcher, { useClass: GmailQueryMatcher });
    container.register(GmailTriggerAttachmentService, { useClass: GmailTriggerAttachmentService });
    container.register(GmailTriggerTestItemService, { useClass: GmailTriggerTestItemService });
    container.register(GmailWatchService, { useClass: GmailWatchService });
    container.register(GmailPullTriggerRuntime, { useClass: GmailPullTriggerRuntime });
    void context.consumerRoot;
    void context.repoRoot;
    void context.env;
    void context.workflowSources;
  }

  private registerCredentialTypes(application: unknown): void {
    const registrar = this.asCredentialTypeRegistrar(application);
    if (!registrar) {
      return;
    }
    registrar.registerCredentialType({
      definition: {
        typeId: GmailCredentialTypes.serviceAccount,
        displayName: "Gmail service account",
        description: "Google service account credentials that resolve to a Gmail trigger client.",
        secretFields: [
          { key: "clientEmail", label: "Client email", type: "string", required: true },
          { key: "privateKey", label: "Private key", type: "textarea", required: true },
          { key: "projectId", label: "Project id", type: "string", required: true },
          { key: "delegatedUser", label: "Delegated user", type: "string", required: true },
        ],
        supportedSourceKinds: ["db", "env", "code"],
      },
      createSession: async (args) => {
        return await this.createGoogleGmailApiClient(this.toServiceAccountCredential(args.material));
      },
      test: async (args) => {
        const credential = this.toServiceAccountCredential(args.material);
        return this.testGmailApiClient(await this.createGoogleGmailApiClient(credential), credential.delegatedUser);
      },
    });
    registrar.registerCredentialType({
      definition: {
        typeId: GmailCredentialTypes.oauth,
        displayName: "Gmail OAuth",
        description: "OAuth2 credentials for a Gmail account connection managed by the framework.",
        publicFields: [
          {
            key: "clientId",
            label: "Client ID",
            type: "string",
            required: true,
            envVarName: "CODEMATION_GOOGLE_CLIENT_ID",
            helpText: "Optional when CODEMATION_GOOGLE_CLIENT_ID is set in the host environment.",
          },
        ],
        secretFields: [
          {
            key: "clientSecret",
            label: "Client secret",
            type: "password",
            required: true,
            envVarName: "CODEMATION_GOOGLE_CLIENT_SECRET",
            helpText: "Optional when CODEMATION_GOOGLE_CLIENT_SECRET is set in the host environment.",
          },
        ],
        supportedSourceKinds: ["db", "env", "code"],
        auth: {
          kind: "oauth2",
          providerId: "google",
          scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
        },
      },
      createSession: async (args) => {
        return await this.createGoogleGmailApiClient(this.toOAuthCredential(args.material, args.publicConfig));
      },
      test: async (args) => {
        return this.testGmailApiClient(
          await this.createGoogleGmailApiClient(this.toOAuthCredential(args.material, args.publicConfig)),
          "me",
        );
      },
    });
  }

  private async createGoogleGmailApiClient(
    credential: GmailServiceAccountCredential | GmailOAuthCredential,
  ): Promise<GmailApiClient> {
    const { GoogleGmailApiClient } = await import("../adapters/google/GoogleGmailApiClientFactory");
    return new GoogleGmailApiClient(credential);
  }

  private async testGmailApiClient(
    client: GmailApiClient,
    mailbox: string,
  ): Promise<
    Readonly<{
      status: "healthy" | "failing";
      message?: string;
      testedAt: string;
      details?: Readonly<Record<string, unknown>>;
    }>
  > {
    try {
      const historyId = await client.getCurrentHistoryId({ mailbox });
      return {
        status: "healthy",
        message: "Connected to Gmail successfully.",
        testedAt: new Date().toISOString(),
        details: { historyId },
      };
    } catch (error) {
      return {
        status: "failing",
        message: error instanceof Error ? error.message : String(error),
        testedAt: new Date().toISOString(),
      };
    }
  }

  private asCredentialTypeRegistrar(application: unknown): CredentialTypeRegistrar | undefined {
    if (!application || typeof application !== "object") {
      return undefined;
    }
    return typeof (application as { registerCredentialType?: unknown }).registerCredentialType === "function"
      ? (application as CredentialTypeRegistrar)
      : undefined;
  }

  private toServiceAccountCredential(material: Readonly<Record<string, unknown>>): GmailServiceAccountCredential {
    const clientEmail = String(material.clientEmail ?? "");
    const privateKey = String(material.privateKey ?? "");
    const projectId = String(material.projectId ?? "");
    const delegatedUser = String(material.delegatedUser ?? "");
    if (!clientEmail || !privateKey || !projectId || !delegatedUser) {
      throw new Error("Gmail service account material is incomplete.");
    }
    return {
      clientEmail,
      privateKey,
      projectId,
      delegatedUser,
    };
  }

  private toOAuthCredential(
    material: Readonly<Record<string, unknown>>,
    publicConfig: Readonly<Record<string, unknown>>,
  ): GmailOAuthCredential {
    const clientId = String(publicConfig.clientId ?? "");
    const clientSecret = String(material.clientSecret ?? "");
    const accessToken = String(material.access_token ?? "");
    const refreshToken = String(material.refresh_token ?? "");
    const expiry = String(material.expiry ?? "");
    if (!clientId || !clientSecret || !accessToken) {
      throw new Error("Gmail OAuth material is incomplete.");
    }
    return {
      clientId,
      clientSecret,
      accessToken,
      refreshToken: refreshToken || undefined,
      expiry: expiry || undefined,
    };
  }
}
