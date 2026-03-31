import type { Metadata } from "next";
import type { ReactNode } from "react";

import { CodemationNextHost } from "../../src/server/CodemationNextHost";

export async function generateMetadata(): Promise<Metadata> {
  try {
    const frontendAppConfig = await CodemationNextHost.shared.getFrontendAppConfig();
    return {
      title: `Sign in — ${frontendAppConfig.productName}`,
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
