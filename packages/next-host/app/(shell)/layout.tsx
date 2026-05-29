import type { ReactNode } from "react";
import { Toaster } from "sonner";
import { AppLayout } from "../../src/shell/AppLayout";
import { WorkflowDetailChromeProvider } from "../../src/shell/WorkflowDetailChromeContext";

// Mirrors PairingConfigFactory.create() returning null: pairing is configured iff
// all three env vars are set. We avoid the DI container here because pulling in
// CodemationNextHost transitively imports PrismaMigrationDeployer (createRequire +
// require.resolve dynamic lookups), which trips the Turbopack module tracer and
// flags the entire project as traced unintentionally on this Server Component.
export default function ShellLayout(args: Readonly<{ children: ReactNode }>) {
  const isNonManaged =
    !process.env["WORKSPACE_ID"] || !process.env["WORKSPACE_PAIRING_SECRET"] || !process.env["CONTROL_PLANE_URL"];
  return (
    <WorkflowDetailChromeProvider>
      <AppLayout isNonManaged={isNonManaged}>{args.children}</AppLayout>
      <Toaster richColors position="bottom-right" />
    </WorkflowDetailChromeProvider>
  );
}
