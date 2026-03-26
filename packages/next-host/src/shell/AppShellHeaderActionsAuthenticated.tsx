"use client";

import { signOut, useSession } from "next-auth/react";

import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";

export function AppShellHeaderActionsAuthenticated(): ReactNode {
  const { data: session, status } = useSession();
  const [isSigningOut, setIsSigningOut] = useState(false);

  if (status === "loading") {
    return (
      <div
        className="flex shrink-0 items-center gap-4"
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
        onClick={handleSignOut}
      >
        {isSigningOut ? "Signing out…" : "Log out"}
      </Button>
    </div>
  );
}
