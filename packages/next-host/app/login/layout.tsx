import type { Metadata } from "next";
import type { ReactNode } from "react";

import { CodemationRuntimeBootstrapClient } from "../../src/bootstrap/CodemationRuntimeBootstrapClient";

export async function generateMetadata(): Promise<Metadata> {
  try {
    const frontendAppConfig = await new CodemationRuntimeBootstrapClient().getPublicFrontendBootstrap();
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
