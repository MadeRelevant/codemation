/// <reference types="vite/client" />
import type { ReactNode } from "react";
import { Providers } from "@codemation/frontend/client";
import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Codemation Start Spike" },
    ],
  }),
  component: RootRouteComponent,
});

function RootRouteComponent() {
  return (
    <RootDocument>
      <Providers websocketPort={import.meta.env.VITE_CODEMATION_WS_PORT}>
        <Outlet />
      </Providers>
    </RootDocument>
  );
}

function RootDocument(args: Readonly<{ children: ReactNode }>) {
  const { children } = args;
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body style={{ margin: 0, minHeight: "100vh", background: "#f8fafc", color: "#111827", fontFamily: "ui-sans-serif, system-ui" }}>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
