import "@xyflow/react/dist/style.css";
import { League_Spartan } from "next/font/google";
import "rc-tree/assets/index.css";
import type { ReactNode } from "react";
import { auth } from "../src/auth/codemationNextAuth";
import { CodemationNextClientShell } from "../src/shell/CodemationNextClientShell";
import { CodemationSessionRoot } from "../src/providers/CodemationSessionProvider";
import "./globals.css";

const leagueSpartan = League_Spartan({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-league-spartan",
});

export const metadata = {
  title: "Codemation",
  description: "Framework-managed workflows running inside the Next.js host.",
};

export default async function RootLayout(args: Readonly<{ children: ReactNode }>) {
  const skipUiAuth = process.env.CODEMATION_SKIP_UI_AUTH === "true";
  const session = skipUiAuth ? null : await auth();
  return (
    <html lang="en" className={leagueSpartan.variable} suppressHydrationWarning>
      <body className={leagueSpartan.className} suppressHydrationWarning>
        <CodemationNextClientShell>
          <CodemationSessionRoot enabled={!skipUiAuth} session={session}>
            {args.children}
          </CodemationSessionRoot>
        </CodemationNextClientShell>
      </body>
    </html>
  );
}
