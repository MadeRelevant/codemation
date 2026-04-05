"use client";

import { useContext, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { CodemationBetterAuthBrowserClientFactory } from "../auth/CodemationBetterAuthBrowserClientFactory";
import { CodemationSessionRootContext } from "../providers/CodemationSessionProvider";

export function AppShellHeaderActionsAuthenticated(): ReactNode {
  const sessionContext = useContext(CodemationSessionRootContext);
  const [isSigningOut, setIsSigningOut] = useState(false);

  if (sessionContext.status === "loading") {
    return (
      <div
        className="flex shrink-0 items-center gap-4"
        data-testid="header-session-loading"
        aria-busy="true"
        aria-label="Loading session"
      />
    );
  }

  const email = sessionContext.session?.email;
  if (!email) {
    return null;
  }

  const handleSignOut = async (): Promise<void> => {
    setIsSigningOut(true);
    try {
      const client = new CodemationBetterAuthBrowserClientFactory().create();
      await client.signOut();
    } finally {
      window.location.assign("/login");
    }
  };

  return (
    <div className="flex shrink-0 items-center gap-4">
      <span className="max-w-56 truncate text-xs text-muted-foreground" data-testid="header-user-email">
        {email}
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        data-testid="header-logout"
        disabled={isSigningOut}
        onClick={() => void handleSignOut()}
      >
        {isSigningOut ? "Signing out…" : "Log out"}
      </Button>
    </div>
  );
}
