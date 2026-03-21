"use client";

import { usePathname } from "next/navigation";

import type { ReactNode } from "react";

export function AppMainContent(args: Readonly<{ children: ReactNode }>): ReactNode {
  const pathname = usePathname();
  const isWorkflowDetail = /^\/workflows\/[^/]+$/.test(pathname);
  return (
    <div className={`app-main__content ${isWorkflowDetail ? "app-main__content--full-bleed" : ""}`}>
      {args.children}
    </div>
  );
}
