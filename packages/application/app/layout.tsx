import "@xyflow/react/dist/style.css";
import "rc-tree/assets/index.css";
import type { ReactNode } from "react";
import { AppProviders } from "./_providers/AppProviders";

export default function RootLayout({ children }: { children: ReactNode }) {
  const websocketPort = process.env.NEXT_PUBLIC_CODEMATION_WS_PORT ?? process.env.CODEMATION_WS_PORT;

  return (
    <html lang="en" style={{ height: "100%" }} suppressHydrationWarning>
      <body style={{ margin: 0, height: "100%", background: "#fff", color: "#111827" }}>
        <AppProviders websocketPort={websocketPort}>{children}</AppProviders>
      </body>
    </html>
  );
}

