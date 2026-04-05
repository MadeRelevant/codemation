import { InAppCallbackUrlPolicy } from "@codemation/host-src/infrastructure/auth/InAppCallbackUrlPolicy";
import { CodemationRuntimeBootstrapClient } from "../../src/bootstrap/CodemationRuntimeBootstrapClient";
import { LoginPageClient } from "../../src/shell/LoginPageClient";

export default async function LoginPage(args: Readonly<{ searchParams: Promise<{ callbackUrl?: string }> }>) {
  const searchParams = await args.searchParams;
  const rawCallbackUrl =
    typeof searchParams.callbackUrl === "string" && searchParams.callbackUrl.length > 0
      ? searchParams.callbackUrl
      : undefined;
  const callbackUrl = new InAppCallbackUrlPolicy().resolveSafeRelativeCallbackUrl(rawCallbackUrl);
  const fallbackWhitelabel = { productName: "Codemation", logoUrl: null } as const;
  try {
    const frontendAppConfig = await new CodemationRuntimeBootstrapClient().getPublicFrontendBootstrap();
    return (
      <LoginPageClient
        authStatus="resolved"
        callbackUrl={callbackUrl}
        credentialsEnabled={frontendAppConfig.credentialsEnabled}
        productName={frontendAppConfig.productName}
        logoUrl={frontendAppConfig.logoUrl}
        oauthProviders={frontendAppConfig.oauthProviders}
      />
    );
  } catch (error) {
    return (
      <LoginPageClient
        authStatus="failed"
        authFailureMessage={error instanceof Error ? error.message : undefined}
        callbackUrl={callbackUrl}
        credentialsEnabled={false}
        productName={fallbackWhitelabel.productName}
        logoUrl={fallbackWhitelabel.logoUrl}
        oauthProviders={[]}
      />
    );
  }
}
