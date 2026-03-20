import { LoginPageClient } from "../../src/ui/LoginPageClient";

export default async function LoginPage(args: Readonly<{ searchParams?: Promise<{ callbackUrl?: string }> }>) {
  const searchParams = args.searchParams ? await args.searchParams : {};
  const callbackUrl = typeof searchParams.callbackUrl === "string" ? searchParams.callbackUrl : "/dashboard";
  return <LoginPageClient callbackUrl={callbackUrl} />;
}
