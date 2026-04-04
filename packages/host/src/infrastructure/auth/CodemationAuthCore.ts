import { inject, injectable } from "@codemation/core";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { Auth, skipCSRFCheck } from "@auth/core";
import { ApplicationRequestError } from "../../application/ApplicationRequestError";
import { ApplicationTokens } from "../../applicationTokens";
import type { AppConfig } from "../../presentation/config/AppConfig";
import type { PrismaClient } from "../persistence/generated/prisma-client/client.js";
import { CodemationAuthProviderCatalog } from "./CodemationAuthProviderCatalog";
import { CodemationAuthRequestFactory } from "./CodemationAuthRequestFactory";
import { InAppCallbackUrlPolicy } from "./InAppCallbackUrlPolicy";

@injectable()
export class CodemationAuthCore {
  constructor(
    @inject(ApplicationTokens.AppConfig)
    private readonly appConfig: AppConfig,
    private readonly prismaClient: PrismaClient | undefined,
    private readonly providerCatalog: CodemationAuthProviderCatalog,
    private readonly requestFactory: CodemationAuthRequestFactory,
    @inject(InAppCallbackUrlPolicy)
    private readonly inAppCallbackUrlPolicy: InAppCallbackUrlPolicy,
  ) {}

  async startOAuth(request: Request, providerId: string): Promise<Response> {
    this.assertProviderConfigured(providerId);
    const requestUrl = new URL(request.url);
    const callbackUrl = requestUrl.searchParams.get("callbackUrl");
    const authUrl = this.buildAuthUrl(request, `/api/auth/signin/${encodeURIComponent(providerId)}`);
    if (callbackUrl) {
      const safeCallbackUrl = this.inAppCallbackUrlPolicy.resolveSafeRelativeCallbackUrl(callbackUrl);
      authUrl.searchParams.set("callbackUrl", safeCallbackUrl);
    }
    return await Auth(this.requestFactory.create(authUrl, request, "POST"), this.createConfig());
  }

  async handleOAuthCallback(request: Request, providerId: string): Promise<Response> {
    this.assertProviderConfigured(providerId);
    const incomingUrl = new URL(request.url);
    const authUrl = this.buildAuthUrl(
      request,
      `/api/auth/callback/${encodeURIComponent(providerId)}${incomingUrl.search}`,
    );
    return await Auth(this.requestFactory.create(authUrl, request, request.method), this.createConfig());
  }

  private createConfig(): Parameters<typeof Auth>[1] {
    const prismaClient = this.requirePrismaClient();
    return {
      adapter: PrismaAdapter(prismaClient),
      basePath: "/api/auth",
      providers: [...this.providerCatalog.build(this.appConfig.auth, prismaClient, this.appConfig.env)],
      // The host owns the OAuth start endpoint and only exposes backend-controlled routes.
      // Auth.js state + PKCE still protect the provider redirect/callback flow.
      skipCSRFCheck,
      trustHost: true,
      session: { strategy: "jwt" },
      secret: this.requireAuthSecret(),
      callbacks: {
        redirect: async ({ url, baseUrl }) => {
          try {
            const nextUrl = new URL(url, baseUrl);
            if (nextUrl.origin !== new URL(baseUrl).origin) {
              return baseUrl;
            }
            return nextUrl.toString();
          } catch {
            return baseUrl;
          }
        },
      },
    };
  }

  private assertProviderConfigured(providerId: string): void {
    const providerIds = new Set<string>();
    for (const provider of this.providerCatalog.build(this.appConfig.auth, this.prismaClient, this.appConfig.env)) {
      if (typeof provider !== "object" || provider === null || !("id" in provider)) {
        continue;
      }
      const resolvedId = provider.id;
      if (typeof resolvedId === "string") {
        providerIds.add(resolvedId);
      }
    }
    if (!providerIds.has(providerId)) {
      throw new ApplicationRequestError(404, `Unknown OAuth provider: ${providerId}`);
    }
  }

  private buildAuthUrl(request: Request, pathname: string): URL {
    const source = new URL(request.url);
    const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
    const protocol = forwardedProto && forwardedProto.length > 0 ? `${forwardedProto}:` : source.protocol;
    const host = forwardedHost && forwardedHost.length > 0 ? forwardedHost : source.host;
    return new URL(pathname, `${protocol}//${host}`);
  }

  private requireAuthSecret(): string {
    const secret =
      this.appConfig.env.AUTH_SECRET?.trim() ||
      (this.appConfig.env.NODE_ENV !== "production" ? "codemation-dev-auth-secret-not-for-production" : "");
    if (!secret) {
      throw new Error("AUTH_SECRET is required for Codemation authentication.");
    }
    return secret;
  }

  private requirePrismaClient(): PrismaClient {
    if (!this.prismaClient) {
      throw new ApplicationRequestError(503, "Authentication requires prepared runtime database persistence.");
    }
    return this.prismaClient;
  }
}
