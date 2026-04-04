"use client";

import { ApiPaths } from "@codemation/host-src/presentation/http/ApiPaths";
import { useContext, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
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

  const readCsrfCookie = (): string | null => {
    const cookies = document.cookie.split(";");
    for (const rawCookie of cookies) {
      const separatorIndex = rawCookie.indexOf("=");
      if (separatorIndex < 0) {
        continue;
      }
      const key = rawCookie.slice(0, separatorIndex).trim();
      if (key !== "codemation.csrf-token" && key !== "__Host-codemation.csrf-token") {
        continue;
      }
      return decodeURIComponent(rawCookie.slice(separatorIndex + 1).trim());
    }
    return null;
  };

  const handleSignOut = async (): Promise<void> => {
    setIsSigningOut(true);
    try {
      const csrfToken = readCsrfCookie();
      if (csrfToken) {
        await fetch(ApiPaths.authLogout(), {
          method: "POST",
          credentials: "include",
          headers: {
            "x-codemation-csrf-token": csrfToken,
          },
        });
      }
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
