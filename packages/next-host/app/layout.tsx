import "@xyflow/react/dist/style.css";
import { League_Spartan } from "next/font/google";
import "rc-tree/assets/index.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { auth } from "../src/auth/nextAuth";
import { CodemationRuntimeBootstrapClient } from "../src/bootstrap/CodemationRuntimeBootstrapClient";
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
  const session = frontendAppConfig?.uiAuthEnabled === false ? null : await auth();
  return (
    <html lang="en" className={leagueSpartan.variable} suppressHydrationWarning>
      <body className={leagueSpartan.className} suppressHydrationWarning>
        <WhitelabelProvider value={whitelabel}>
          <CodemationNextClientShell>
            <CodemationSessionRoot enabled={frontendAppConfig?.uiAuthEnabled !== false} session={session}>
              {args.children}
            </CodemationSessionRoot>
          </CodemationNextClientShell>
        </WhitelabelProvider>
      </body>
    </html>
  );
}
