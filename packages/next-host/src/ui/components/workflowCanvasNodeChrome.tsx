import { Bot,Boxes,Brain,CircleAlert,CircleCheckBig,Clock3,GitBranch,Globe,type LucideIcon,Pin,PlaySquare,SquareStack,Workflow,Wrench } from "lucide-react";

import type { NodeExecutionSnapshot } from "../realtime/realtime";

export function iconForNode(type: string, role?: string, icon?: string): LucideIcon {
  const explicitIcon = icon?.toLowerCase();
  if (explicitIcon === "globe") {
    return Globe;
  }
  if (role === "agent") {
    return Bot;
  }
  if (role === "languageModel") {
    return Brain;
  }
  if (role === "tool") {
    return Wrench;
  }

  const t = type.toLowerCase();

  if (t.includes("if")) {
    return GitBranch;
  }
  if (t.includes("subworkflow")) {
    return Workflow;
  }
  if (t.includes("map")) {
    return SquareStack;
  }
  if (t.includes("trigger")) {
    return PlaySquare;
  }
  if (t.includes("agent") || t.includes("ai")) {
    return Bot;
  }

  return Boxes;
}

export function statusIconForNode(status: NodeExecutionSnapshot["status"] | undefined) {
  if (status === "completed") {
    return <CircleCheckBig size={15} style={{ color: "#15803d" }} strokeWidth={2.1} />;
  }
  if (status === "skipped") {
    return <Clock3 size={15} style={{ color: "#d97706" }} strokeWidth={2.1} />;
  }
  if (status === "failed") {
    return <CircleAlert size={15} style={{ color: "#b91c1c" }} strokeWidth={2.1} />;
  }
  if (status === "running" || status === "queued" || status === "pending" || typeof status === "undefined") {
    return null;
  }
  return null;
}

export function trailingIconForNode(args: Readonly<{ status: NodeExecutionSnapshot["status"] | undefined; isPinned: boolean }>) {
  if (args.isPinned) {
    return <Pin size={14} style={{ color: "#6d28d9" }} strokeWidth={2.4} fill="currentColor" />;
  }
  return statusIconForNode(args.status);
}

export function trailingIconKindForNode(args: Readonly<{ status: NodeExecutionSnapshot["status"] | undefined; isPinned: boolean }>): string {
  if (args.isPinned) {
    return "pin";
  }
  if (args.status === "completed") {
    return "completed";
  }
  if (args.status === "skipped") {
    return "skipped";
  }
  if (args.status === "failed") {
    return "failed";
  }
  return "none";
}
