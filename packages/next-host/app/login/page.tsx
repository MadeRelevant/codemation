import { CodemationNextAuthOAuthProviderSnapshotResolver } from "../../src/auth/CodemationNextAuthOAuthProviderSnapshotResolver";
import { CodemationNextHost } from "../../src/server/CodemationNextHost";
import { LoginPageClient } from "../../src/shell/LoginPageClient";

export default async function LoginPage(args: Readonly<{ searchParams: Promise<{ callbackUrl?: string }> }>) {
  const searchParams = await args.searchParams;
  const callbackUrl =
    typeof searchParams.callbackUrl === "string" && searchParams.callbackUrl.length > 0
      ? searchParams.callbackUrl
      : "/";
  const fallbackWhitelabel = { productName: "Codemation", logoUrl: null } as const;
  const whitelabel = await CodemationNextHost.shared.getWhitelabelSnapshot().catch(() => fallbackWhitelabel);
  const oauthProviders = await new CodemationNextAuthOAuthProviderSnapshotResolver().resolve().catch(() => []);
  return (
    <LoginPageClient
      callbackUrl={callbackUrl}
      productName={whitelabel.productName}
      logoUrl={whitelabel.logoUrl}
      oauthProviders={oauthProviders}
    />
  );
}
