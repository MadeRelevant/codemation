"use client";

import * as React from "react";

import { Badge } from "./ui/badge";
import { cn } from "../lib/cn";

export type StatusKind = "success" | "warning" | "danger" | "neutral" | "info";

const KIND_CLASSES: Record<StatusKind, string> = {
  success:
    "bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800",
  warning:
    "bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800",
  danger:
    "bg-red-100 text-red-800 border-red-200 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800",
  neutral: "border-border text-foreground bg-transparent hover:bg-muted",
  info: "bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800",
};

export interface StatusPillProps {
  status: StatusKind;
  children?: React.ReactNode;
  className?: string;
}

export function StatusPill({ status, children, className }: StatusPillProps) {
  return (
    <Badge variant="outline" className={cn("inline-flex items-center gap-1", KIND_CLASSES[status], className)}>
      {children ?? status}
    </Badge>
  );
}
