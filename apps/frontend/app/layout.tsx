import "@xyflow/react/dist/style.css";
import type { ReactNode } from "react";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" style={{ height: "100%" }}>
      <body style={{ margin: 0, height: "100%", background: "#fff", color: "#111827" }}>{children}</body>
    </html>
  );
}

