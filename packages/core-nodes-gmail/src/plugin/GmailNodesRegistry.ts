import type { Container, CredentialType } from "@codemation/core";
import type { CodemationPluginContext } from "@codemation/host";
import {
  GoogleGmailApiClientFactory,
  GoogleGmailApiClientScopeCatalog,
  GoogleGmailSessionFactory,
} from "../adapters/google/GoogleGmailApiClientFactory";
import { GmailCredentialTypes } from "../contracts/GmailCredentialTypes";
import type { GmailNodesOptions } from "../contracts/GmailNodesOptions";
import { GmailNodeTokens } from "../contracts/GmailNodeTokens";
import type {
  GmailOAuthCredential,
  GmailOAuthMaterial,
  GmailOAuthPublicConfig,
} from "../contracts/GmailOAuthCredential";
import type { GmailSession } from "../contracts/GmailSession";
import { GmailPollingTriggerRuntime } from "../runtime/GmailPollingTriggerRuntime";
import { GmailConfiguredLabelService } from "../services/GmailConfiguredLabelService";
import { GmailMessageItemMapper } from "../services/GmailMessageItemMapper";
import { GmailPollingService } from "../services/GmailPollingService";
import { GmailQueryMatcher } from "../services/GmailQueryMatcher";
import { GmailTriggerAttachmentService } from "../services/GmailTriggerAttachmentService";
import { GmailTriggerTestItemService } from "../services/GmailTriggerTestItemService";

export class GmailNodes {
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
    container.register(GoogleGmailApiClientFactory, { useClass: GoogleGmailApiClientFactory });
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
    const oauthType: CredentialType<GmailOAuthPublicConfig, GmailOAuthMaterial, GmailSession> = {
      definition: {
        typeId: GmailCredentialTypes.oauth,
        displayName: "Gmail OAuth",
        description:
          "OAuth2 credentials for a Gmail account connection managed by the framework, with default scopes that cover trigger, read, send, reply, and label actions.",
        publicFields: [
          {
            key: "clientId",
            label: "Client ID",
            type: "string",
            required: true,
            envVarName: "CODEMATION_GOOGLE_CLIENT_ID",
          },
          {
            key: "scopePreset",
            label: "Scope preset",
            type: "string",
            placeholder: GoogleGmailApiClientScopeCatalog.defaultPresetKey,
            helpText:
              'Use "automation" for trigger/read/send/reply/label, "readonly" for polling/read only, or "custom" to replace the default bundle with `customScopes`.',
          },
          {
            key: "customScopes",
            label: "Custom scopes",
            type: "textarea",
            placeholder: "https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.send",
            helpText:
              'Only used when `scopePreset` is "custom". Values replace the default bundle and may be comma-, space-, or newline-separated.',
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
          scopes: GoogleGmailApiClientScopeCatalog.presetScopes[GoogleGmailApiClientScopeCatalog.defaultPresetKey],
          scopesFromPublicConfig: {
            presetFieldKey: "scopePreset",
            presetScopes: GoogleGmailApiClientScopeCatalog.presetScopes,
            customPresetKey: GoogleGmailApiClientScopeCatalog.customPresetKey,
            customScopesFieldKey: "customScopes",
          },
        },
      },
      createSession: async (args) => {
        return await this.createGoogleGmailSession(this.toOAuthCredential(args.material, args.publicConfig));
      },
      test: async (args) => {
        return await this.testGmailApiClient(
          await this.createGoogleGmailSession(this.toOAuthCredential(args.material, args.publicConfig)),
        );
      },
    };
    context.registerCredentialType(oauthType);
  }

  private async createGoogleGmailSession(credential: GmailOAuthCredential): Promise<GmailSession> {
    return await new GoogleGmailSessionFactory().createSession(credential);
  }

  private async testGmailApiClient(session: GmailSession): Promise<
    Readonly<{
      status: "healthy" | "failing";
      message?: string;
      testedAt: string;
      details?: Readonly<Record<string, unknown>>;
    }>
  > {
    try {
      const client = new GoogleGmailApiClientFactory().create(session);
      const historyId = await client.getCurrentHistoryId({ mailbox: session.userId });
      return {
        status: "healthy",
        message: "Connected to Gmail successfully.",
        testedAt: new Date().toISOString(),
        details: { emailAddress: session.emailAddress, historyId, scopes: session.scopes },
      };
    } catch (error) {
      return {
        status: "failing",
        message: error instanceof Error ? error.message : String(error),
        testedAt: new Date().toISOString(),
      };
    }
  }

  private toOAuthCredential(material: GmailOAuthMaterial, publicConfig: GmailOAuthPublicConfig): GmailOAuthCredential {
    const clientId = String(publicConfig.clientId ?? "");
    const clientSecret = String(material.clientSecret ?? "");
    const accessToken = String(material.access_token ?? "");
    const refreshToken = String(material.refresh_token ?? "");
    const expiry = String(material.expiry ?? "");
    const scopeValue = String(material.scope ?? "");
    if (!clientId || !clientSecret || !accessToken) {
      throw new Error("Gmail OAuth material is incomplete.");
    }
    return {
      clientId,
      clientSecret,
      accessToken,
      refreshToken: refreshToken || undefined,
      expiry: expiry || undefined,
      scopes: this.resolveCredentialScopes(scopeValue, publicConfig),
    };
  }

  private resolveCredentialScopes(scopeValue: string, publicConfig: GmailOAuthPublicConfig): ReadonlyArray<string> {
    const grantedScopes = scopeValue
      .split(/\s+/)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
    if (grantedScopes.length > 0) {
      return grantedScopes;
    }
    const preset = String(publicConfig.scopePreset ?? "").trim() || GoogleGmailApiClientScopeCatalog.defaultPresetKey;
    if (preset === GoogleGmailApiClientScopeCatalog.customPresetKey) {
      const customScopes = String(publicConfig.customScopes ?? "")
        .split(/[\s,]+/)
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
      if (customScopes.length > 0) {
        return [...new Set(customScopes)];
      }
    }
    return (
      GoogleGmailApiClientScopeCatalog.presetScopes[preset] ??
      GoogleGmailApiClientScopeCatalog.presetScopes[GoogleGmailApiClientScopeCatalog.defaultPresetKey]
    );
  }
}
