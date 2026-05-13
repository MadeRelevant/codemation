import type { CredentialType, CredentialStore } from "../domain/credentials/CredentialServices";
import { CredentialSecretCipher } from "../domain/credentials/CredentialSecretCipher";
import { CredentialDisconnectedError } from "./refresh/CredentialDisconnectedError";

export type OAuth2ViaBrokerPublicConfig = Readonly<{
  oauthAppKey?: unknown;
}>;

/** Subset of the HTTP credential delta that this session produces. */
type BearerHeaderDelta = Readonly<{
  headers: Readonly<Record<string, string>>;
}>;

export type OAuth2ViaBrokerSession = Readonly<{
  applyToRequest: (_spec: unknown) => BearerHeaderDelta;
}>;

/**
 * Builds the `host.oauth2-via-broker` credential type registration.
 *
 * This credential type covers every control-plane-served OAuth MCP server.
 * At session creation it reads the current access token from the local
 * credential store (populated by the broker push endpoint, Story 3/4) and
 * returns a session that injects `Authorization: Bearer <token>` on requests.
 *
 * Token refresh is handled upstream by `RemoteOAuthRefreshDelegate` —
 * this factory only reads the stored material, consistent with the Story 8 scope boundary.
 *
 * Registered by `AppContainerFactory.registerCredentialTypes` alongside the other built-in types.
 */
export class OAuth2ViaBrokerCredentialTypeFactory {
  constructor(
    private readonly credentialStore: CredentialStore,
    private readonly cipher: CredentialSecretCipher,
  ) {}

  register(): CredentialType<OAuth2ViaBrokerPublicConfig, Record<string, never>, OAuth2ViaBrokerSession> {
    const { credentialStore, cipher } = this;

    return {
      definition: {
        typeId: "host.oauth2-via-broker",
        displayName: "OAuth 2.0 via Broker",
        description:
          "OAuth access token obtained from the Codemation control-plane broker. " +
          "Connect the integration from the Control Plane; no manual secret entry is required.",
        publicFields: [
          {
            key: "oauthAppKey",
            label: "OAuth App Key",
            type: "string",
            required: true,
            helpText: 'The OAuthApp.key on the control plane (e.g. "google-mail").',
          },
        ],
        secretFields: [],
        supportedSourceKinds: ["db"],
      },
      async createSession(args) {
        const instanceId = args.instance.instanceId;
        const material = await credentialStore.getOAuth2Material(instanceId);
        if (!material) {
          throw new CredentialDisconnectedError(instanceId);
        }

        const decrypted = cipher.decrypt(material);
        const accessToken = decrypted.access_token;
        if (typeof accessToken !== "string" || accessToken.length === 0) {
          throw new CredentialDisconnectedError(instanceId);
        }

        return {
          applyToRequest: (_spec): BearerHeaderDelta => ({
            headers: { authorization: `Bearer ${accessToken}` },
          }),
        };
      },
      async test(args) {
        const instanceId = args.instance.instanceId;
        try {
          const material = await credentialStore.getOAuth2Material(instanceId);
          if (!material) {
            return {
              status: "failing",
              message: "No OAuth2 material found — connect via the Control Plane.",
              testedAt: new Date().toISOString(),
            };
          }

          const decrypted = cipher.decrypt(material);
          const accessToken = decrypted.access_token;
          if (typeof accessToken !== "string" || accessToken.length === 0) {
            return {
              status: "failing",
              message: "Stored access token is missing or invalid — reconnect via the Control Plane.",
              testedAt: new Date().toISOString(),
            };
          }

          const expiryIso =
            typeof decrypted.expiry === "string" && decrypted.expiry.length > 0 ? decrypted.expiry : undefined;
          if (expiryIso !== undefined && new Date(expiryIso).getTime() <= Date.now()) {
            return {
              status: "failing",
              message: "Access token is expired — a refresh will be attempted on next use.",
              testedAt: new Date().toISOString(),
            };
          }

          return {
            status: "healthy",
            message: "Access token is present and not expired.",
            testedAt: new Date().toISOString(),
          };
        } catch {
          return {
            status: "failing",
            message: "Failed to read credential material.",
            testedAt: new Date().toISOString(),
          };
        }
      },
    };
  }
}
