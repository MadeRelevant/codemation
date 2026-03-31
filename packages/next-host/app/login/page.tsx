import { CodemationNextHost } from "../../src/server/CodemationNextHost";
import { LoginPageClient } from "../../src/shell/LoginPageClient";

export default async function LoginPage(args: Readonly<{ searchParams: Promise<{ callbackUrl?: string }> }>) {
  const searchParams = await args.searchParams;
  const callbackUrl =
    typeof searchParams.callbackUrl === "string" && searchParams.callbackUrl.length > 0
      ? searchParams.callbackUrl
      : "/";
  const fallbackWhitelabel = { productName: "Codemation", logoUrl: null } as const;
  try {
    const frontendAppConfig = await CodemationNextHost.shared.getFrontendAppConfig();
    return (
      <LoginPageClient
        authStatus="resolved"
        callbackUrl={callbackUrl}
        credentialsEnabled={frontendAppConfig.auth.credentialsEnabled}
        productName={frontendAppConfig.productName}
        logoUrl={frontendAppConfig.logoUrl}
        oauthProviders={frontendAppConfig.auth.oauthProviders}
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
