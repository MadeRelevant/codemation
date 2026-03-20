import type { ReactNode } from "react";
import { AppLayout } from "../../src/ui/AppLayout";

export default function ShellLayout(args: Readonly<{ children: ReactNode }>) {
  return <AppLayout>{args.children}</AppLayout>;
}
