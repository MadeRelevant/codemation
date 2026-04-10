import "@xyflow/react/dist/style.css";
import { League_Spartan } from "next/font/google";
import "rc-tree/assets/index.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { headers } from "next/headers";
import { dehydrate, QueryClient } from "@tanstack/react-query";
import { ApiPaths } from "@codemation/host-src/presentation/http/ApiPaths";
import type { WorkflowSummary } from "@codemation/host-src/application/contracts/WorkflowViewContracts";
import type { UserAccountDto } from "@codemation/host-src/application/contracts/userDirectoryContracts.types";
import { CodemationRuntimeBootstrapClient } from "../src/bootstrap/CodemationRuntimeBootstrapClient";
import { CodemationRuntimeUrlResolver } from "../src/bootstrap/CodemationRuntimeUrlResolver";
import { userAccountsQueryKey, workflowsQueryKey } from "../src/features/workflows/lib/realtime/realtimeQueryKeys";
import { WhitelabelProvider } from "../src/providers/WhitelabelProvider";
import { CodemationNextClientShell } from "../src/shell/CodemationNextClientShell";
import { CodemationSessionRoot } from "../src/providers/CodemationSessionProvider";
import "./globals.css";

/** Consumer whitelabel and auth must be evaluated per request; do not statically cache the root shell. */
export const dynamic = "force-dynamic";

const leagueSpartan = League_Spartan({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-league-spartan",
});

const defaultWhitelabel: Readonly<{ productName: string; logoUrl: string | null }> = {
  productName: "Codemation",
  logoUrl: null,
};

export async function generateMetadata(): Promise<Metadata> {
  try {
    const frontendAppConfig = await new CodemationRuntimeBootstrapClient().getPublicFrontendBootstrap();
    return {
      title: frontendAppConfig.productName,
      description: "Framework-managed workflows running inside the Next.js host.",
    };
  } catch {
    return {
      title: defaultWhitelabel.productName,
      description: "Framework-managed workflows running inside the Next.js host.",
    };
  }
}

export default async function RootLayout(args: Readonly<{ children: ReactNode }>) {
  let frontendAppConfig: Awaited<ReturnType<CodemationRuntimeBootstrapClient["getPublicFrontendBootstrap"]>> | null =
    null;
  let whitelabel: typeof defaultWhitelabel;
  try {
    frontendAppConfig = await new CodemationRuntimeBootstrapClient().getPublicFrontendBootstrap();
    whitelabel = {
      productName: frontendAppConfig.productName,
      logoUrl: frontendAppConfig.logoUrl,
    };
  } catch {
    whitelabel = defaultWhitelabel;
  }
  const requestHeaders = await headers();
  const cookieHeader = requestHeaders.get("cookie") ?? "";
  const queryClient = new QueryClient();
  if (cookieHeader.trim().length > 0) {
    const resolver = new CodemationRuntimeUrlResolver();
    try {
      const workflowsUrl = resolver.resolve(ApiPaths.workflows());
      const response = await fetch(workflowsUrl, { cache: "no-store", headers: { cookie: cookieHeader } });
      if (response.ok) {
        queryClient.setQueryData(workflowsQueryKey, (await response.json()) as ReadonlyArray<WorkflowSummary>);
      }
    } catch {
      // Ignore — keep shell usable even when the runtime is rebuilding.
    }
    try {
      const usersUrl = resolver.resolve(ApiPaths.users());
      const response = await fetch(usersUrl, { cache: "no-store", headers: { cookie: cookieHeader } });
      if (response.ok) {
        queryClient.setQueryData(userAccountsQueryKey, (await response.json()) as ReadonlyArray<UserAccountDto>);
      }
    } catch {
      // Ignore — keep shell usable even when the runtime is rebuilding.
    }
  }
  const dehydratedState = dehydrate(queryClient);
  return (
    <html lang="en" className={leagueSpartan.variable} suppressHydrationWarning>
      <body className={leagueSpartan.className} suppressHydrationWarning>
        <WhitelabelProvider value={whitelabel}>
          <CodemationNextClientShell dehydratedState={dehydratedState}>
            <CodemationSessionRoot enabled={frontendAppConfig?.uiAuthEnabled !== false}>
              {args.children}
            </CodemationSessionRoot>
          </CodemationNextClientShell>
        </WhitelabelProvider>
      </body>
    </html>
  );
}
