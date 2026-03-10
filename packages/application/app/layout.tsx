import "@xyflow/react/dist/style.css";
import "rc-tree/assets/index.css";
import type { ReactNode } from "react";
import { AppProviders } from "./_providers/AppProviders";

export default function RootLayout({ children }: { children: ReactNode }) {
  const websocketUrl =
    process.env.NEXT_PUBLIC_CODEMATION_WS_URL ??
    (() => {
      const serverPort = process.env.NEXT_PUBLIC_CODEMATION_SERVER_PORT ?? process.env.CODEMATION_SERVER_PORT ?? process.env.PORT ?? "3001";
      return `ws://127.0.0.1:${serverPort}/api/workflows/ws`;
    })();

  return (
    <html lang="en" style={{ height: "100%" }} suppressHydrationWarning>
      <body style={{ margin: 0, height: "100%", background: "#fff", color: "#111827" }}>
        <AppProviders websocketUrl={websocketUrl}>{children}</AppProviders>
      </body>
    </html>
  );
}

