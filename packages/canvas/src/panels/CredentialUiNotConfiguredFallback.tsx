"use client";

import type { ReactNode } from "react";

export function CredentialUiNotConfiguredFallback(): ReactNode {
  return (
    <section style={{ padding: "10px 12px 14px" }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.45, textTransform: "uppercase", opacity: 0.64 }}>
        Credentials
      </div>
      <div style={{ marginTop: 8, fontSize: 12, color: "#6b7280" }}>
        Credential UI not configured in this canvas context.
      </div>
    </section>
  );
}
