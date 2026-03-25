import { LoginPageClient } from "../../src/shell/LoginPageClient";

export default async function LoginPage(args: Readonly<{ searchParams: Promise<{ callbackUrl?: string }> }>) {
  const searchParams = await args.searchParams;
  const callbackUrl =
    typeof searchParams.callbackUrl === "string" && searchParams.callbackUrl.length > 0
      ? searchParams.callbackUrl
      : "/";
  return <LoginPageClient callbackUrl={callbackUrl} />;
}
