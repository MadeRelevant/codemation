import { League_Spartan } from "next/font/google";
import "@xyflow/react/dist/style.css";
import "rc-tree/assets/index.css";
import "./globals.css";
import type { ReactNode } from "react";
import { auth } from "../src/auth/codemationNextAuth";
import { CodemationNextClientShell } from "../src/ui/CodemationNextClientShell";
import { CodemationSessionRoot } from "../src/ui/CodemationSessionProvider";

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
  const session = await auth();
  return (
    <html lang="en" className={leagueSpartan.variable} suppressHydrationWarning>
      <body className={leagueSpartan.className} suppressHydrationWarning>
        <CodemationNextClientShell>
          <CodemationSessionRoot session={session}>{args.children}</CodemationSessionRoot>
        </CodemationNextClientShell>
      </body>
    </html>
  );
}
