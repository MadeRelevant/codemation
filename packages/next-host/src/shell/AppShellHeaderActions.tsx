"use client";

import { signOut, useSession } from "next-auth/react";

import { useState, type ReactNode } from "react";

export function AppShellHeaderActions(): ReactNode {
  const { data: session, status } = useSession();
  const [isSigningOut, setIsSigningOut] = useState(false);

  if (status === "loading") {
    return (
      <div
        className="app-shell-header-actions"
        data-testid="header-session-loading"
        aria-busy="true"
        aria-label="Loading session"
      />
    );
  }

  const email = session?.user?.email;
  if (!email) {
    return null;
  }

  const handleSignOut = (): void => {
    setIsSigningOut(true);
    void signOut({ callbackUrl: "/login" });
  };

  return (
    <div className="app-shell-header-actions">
      <span className="app-shell-header-actions__email" data-testid="header-user-email" title={email}>
        {email}
      </span>
      <button
        type="button"
        className="app-shell-header-actions__logout"
        data-testid="header-logout"
        disabled={isSigningOut}
        onClick={handleSignOut}
      >
        {isSigningOut ? "Signing out…" : "Log out"}
      </button>
    </div>
  );
}
