import type { ReactNode } from "react";
import { Toaster } from "sonner";
import { AppLayout } from "../../src/shell/AppLayout";
import { WorkflowDetailChromeProvider } from "../../src/shell/WorkflowDetailChromeContext";
import { resolvePairingConfig } from "../../src/server/devInboxComposition";

export default async function ShellLayout(args: Readonly<{ children: ReactNode }>) {
  const pairingConfig = await resolvePairingConfig();
  const isNonManaged = pairingConfig === null;
  return (
    <WorkflowDetailChromeProvider>
      <AppLayout isNonManaged={isNonManaged}>{args.children}</AppLayout>
      <Toaster richColors position="bottom-right" />
    </WorkflowDetailChromeProvider>
  );
}
