import type { Metadata } from "next";
import type { ReactNode } from "react";

import { CodemationNextHost } from "../../src/server/CodemationNextHost";

export async function generateMetadata(): Promise<Metadata> {
  try {
    const whitelabel = await CodemationNextHost.shared.getWhitelabelSnapshot();
    return {
      title: `Sign in — ${whitelabel.productName}`,
    };
  } catch {
    return {
      title: "Sign in — Codemation",
    };
  }
}

export default function LoginLayout(args: Readonly<{ children: ReactNode }>) {
  return (
    <div className="codemation-login-root" data-testid="login-layout-root">
      {args.children}
    </div>
  );
}
