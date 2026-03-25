"use client";

import { usePathname } from "next/navigation";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function AppMainContent(args: Readonly<{ children: ReactNode }>): ReactNode {
  const pathname = usePathname();
  const isWorkflowDetail = /^\/workflows\/[^/]+$/.test(pathname);
  return (
    <div className={cn("min-h-0 flex-1 overflow-auto p-8", isWorkflowDetail && "overflow-hidden p-0")}>
      {args.children}
    </div>
  );
}
