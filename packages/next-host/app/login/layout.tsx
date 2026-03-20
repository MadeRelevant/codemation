import type { ReactNode } from "react";

export const metadata = {
  title: "Sign in — Codemation",
};

export default function LoginLayout(args: Readonly<{ children: ReactNode }>) {
  return (
    <div className="codemation-login-root" data-testid="login-layout-root">
      {args.children}
    </div>
  );
}
