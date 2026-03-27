import "@xyflow/react/dist/style.css";
import { League_Spartan } from "next/font/google";
import "rc-tree/assets/index.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { auth } from "../src/auth/codemationNextAuth";
import { WhitelabelProvider } from "../src/providers/WhitelabelProvider";
import { CodemationNextHost } from "../src/server/CodemationNextHost";
import { CodemationNextClientShell } from "../src/shell/CodemationNextClientShell";
import { CodemationSessionRoot } from "../src/providers/CodemationSessionProvider";
import type { CodemationWhitelabelSnapshot } from "../src/whitelabel/CodemationWhitelabelSnapshot";
import "./globals.css";

/** Consumer whitelabel and auth must be evaluated per request; do not statically cache the root shell. */
export const dynamic = "force-dynamic";

const leagueSpartan = League_Spartan({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-league-spartan",
});

const defaultWhitelabel: CodemationWhitelabelSnapshot = {
  productName: "Codemation",
  logoUrl: null,
};

export async function generateMetadata(): Promise<Metadata> {
  try {
    const whitelabel = await CodemationNextHost.shared.getWhitelabelSnapshot();
    return {
      title: whitelabel.productName,
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
  const skipUiAuth = process.env.CODEMATION_SKIP_UI_AUTH === "true";
  const session = skipUiAuth ? null : await auth();
  let whitelabel: CodemationWhitelabelSnapshot;
  try {
    whitelabel = await CodemationNextHost.shared.getWhitelabelSnapshot();
  } catch {
    whitelabel = defaultWhitelabel;
  }
  return (
    <html lang="en" className={leagueSpartan.variable} suppressHydrationWarning>
      <body className={leagueSpartan.className} suppressHydrationWarning>
        <WhitelabelProvider value={whitelabel}>
          <CodemationNextClientShell>
            <CodemationSessionRoot enabled={!skipUiAuth} session={session}>
              {args.children}
            </CodemationSessionRoot>
          </CodemationNextClientShell>
        </WhitelabelProvider>
      </body>
    </html>
  );
}
