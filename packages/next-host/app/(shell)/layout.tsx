import type { ReactNode } from "react";
import { AppLayout } from "../../src/shell/AppLayout";
import { WorkflowDetailChromeProvider } from "../../src/shell/WorkflowDetailChromeContext";

export default function ShellLayout(args: Readonly<{ children: ReactNode }>) {
  return (
    <WorkflowDetailChromeProvider>
      <AppLayout>{args.children}</AppLayout>
    </WorkflowDetailChromeProvider>
  );
}
