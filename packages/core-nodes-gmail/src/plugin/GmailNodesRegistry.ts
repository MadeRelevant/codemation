import type { Container, CredentialType } from "@codemation/core";
import type { CodemationPluginContext } from "@codemation/host";
import { GmailCredentialTypes } from "../contracts/GmailCredentialTypes";
import type { GmailNodesOptions } from "../contracts/GmailNodesOptions";
import { GmailNodeTokens } from "../contracts/GmailNodeTokens";
import type { GmailOAuthCredential } from "../contracts/GmailOAuthCredential";
import type { GmailServiceAccountCredential } from "../contracts/GmailServiceAccountCredential";
import { GmailPollingTriggerRuntime } from "../runtime/GmailPollingTriggerRuntime";
import type { GmailApiClient } from "../services/GmailApiClient";
import { GmailConfiguredLabelService } from "../services/GmailConfiguredLabelService";
import { GmailMessageItemMapper } from "../services/GmailMessageItemMapper";
import { GmailPollingService } from "../services/GmailPollingService";
import { GmailQueryMatcher } from "../services/GmailQueryMatcher";
import { GmailTriggerAttachmentService } from "../services/GmailTriggerAttachmentService";
import { GmailTriggerTestItemService } from "../services/GmailTriggerTestItemService";

type GmailServiceAccountPublicConfig = Readonly<Record<string, never>>;

type GmailServiceAccountMaterial = Readonly<{
  clientEmail?: string;
  privateKey?: string;
  projectId?: string;
  delegatedUser?: string;
}>;

type GmailOAuthPublicConfig = Readonly<{
  clientId?: string;
}>;

type GmailOAuthMaterial = Readonly<{
  clientSecret?: string;
  access_token?: string;
  refresh_token?: string;
  expiry?: string;
}>;

export class GmailNodes {
  readonly pluginPackageId = "@codemation/core-nodes-gmail" as const;

  private readonly options: GmailNodesOptions;

  constructor(options: GmailNodesOptions = {}) {
    this.options = options;
  }

  async register(context: CodemationPluginContext): Promise<void> {
    this.registerOptions(context.container);
    this.registerServices(context.container, context);
    this.registerCredentialTypes(context);
  }

  private registerOptions(container: Container): void {
    container.registerInstance(GmailNodeTokens.GmailNodesOptions, this.options);
  }

  private registerServices(container: Container, context: CodemationPluginContext): void {
    container.registerInstance(GmailNodeTokens.TriggerLogger, context.loggerFactory.create("codemation-gmail.trigger"));
    container.registerInstance(GmailNodeTokens.RuntimeLogger, context.loggerFactory.create("codemation-gmail.runtime"));
    container.register(GmailNodeTokens.GmailApiClient, {
      useFactory: () => {
        throw new Error("GmailApiClient must be supplied by the active Gmail runtime binding.");
      },
    });
    container.register(GmailConfiguredLabelService, { useClass: GmailConfiguredLabelService });
    container.register(GmailMessageItemMapper, { useClass: GmailMessageItemMapper });
    container.register(GmailQueryMatcher, { useClass: GmailQueryMatcher });
    container.register(GmailTriggerAttachmentService, { useClass: GmailTriggerAttachmentService });
    container.register(GmailTriggerTestItemService, { useClass: GmailTriggerTestItemService });
    container.register(GmailPollingService, { useClass: GmailPollingService });
    container.register(GmailPollingTriggerRuntime, { useClass: GmailPollingTriggerRuntime });
    void context.appConfig;
  }

  private registerCredentialTypes(context: CodemationPluginContext): void {
    const serviceAccountType: CredentialType<
      GmailServiceAccountPublicConfig,
      GmailServiceAccountMaterial,
      GmailApiClient
    > = {
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
    };
    context.registerCredentialType(serviceAccountType);
    const oauthType: CredentialType<GmailOAuthPublicConfig, GmailOAuthMaterial, GmailApiClient> = {
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
          },
        ],
        secretFields: [
          {
            key: "clientSecret",
            label: "Client secret",
            type: "password",
            required: true,
            envVarName: "CODEMATION_GOOGLE_CLIENT_SECRET",
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
    };
    context.registerCredentialType(oauthType);
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

  private toServiceAccountCredential(material: GmailServiceAccountMaterial): GmailServiceAccountCredential {
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

  private toOAuthCredential(material: GmailOAuthMaterial, publicConfig: GmailOAuthPublicConfig): GmailOAuthCredential {
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
