import CircleAlert from "lucide-react/dist/esm/icons/circle-alert";
import CircleCheckBig from "lucide-react/dist/esm/icons/circle-check-big";
import Clock3 from "lucide-react/dist/esm/icons/clock-3";
import Hourglass from "lucide-react/dist/esm/icons/hourglass";
import Pin from "lucide-react/dist/esm/icons/pin";
import UserCheck from "lucide-react/dist/esm/icons/user-check";
import UserX from "lucide-react/dist/esm/icons/user-x";

import type { NodeExecutionSnapshot } from "@codemation/canvas-core";

/** Amber used for the HITL "waiting for approval" treatment. */
const WAITING_FOR_APPROVAL_COLOR = "#d97706";

export function statusIconForNode(status: NodeExecutionSnapshot["status"] | undefined) {
  if (status === "completed") {
    return <CircleCheckBig size={15} style={{ color: "#15803d" }} strokeWidth={2.1} />;
  }
  // Human-decided approvals get a person-with-check glyph to distinguish them from
  // a plain "completed" node; rejections get a person-with-x.
  if (status === "hitl-approved") {
    return <UserCheck size={15} style={{ color: "#15803d" }} strokeWidth={2.1} />;
  }
  if (status === "hitl-auto-accepted") {
    return <CircleCheckBig size={15} style={{ color: "#15803d" }} strokeWidth={2.1} />;
  }
  if (status === "hitl-rejected" || status === "hitl-cancelled") {
    return <UserX size={15} style={{ color: "#b91c1c" }} strokeWidth={2.1} />;
  }
  if (status === "skipped" || status === "hitl-timeout") {
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

export function trailingIconForNode(
  args: Readonly<{
    status: NodeExecutionSnapshot["status"] | undefined;
    isPinned: boolean;
    isWaitingForApproval?: boolean;
  }>,
) {
  if (args.isPinned) {
    return <Pin size={14} style={{ color: "#6d28d9" }} strokeWidth={2.4} fill="currentColor" />;
  }
  // Suspended HITL node: distinct hourglass instead of the plain running look.
  if (args.isWaitingForApproval) {
    return <Hourglass size={14} style={{ color: WAITING_FOR_APPROVAL_COLOR }} strokeWidth={2.2} />;
  }
  return statusIconForNode(args.status);
}

export function trailingIconKindForNode(
  args: Readonly<{
    status: NodeExecutionSnapshot["status"] | undefined;
    isPinned: boolean;
    isWaitingForApproval?: boolean;
  }>,
): string {
  if (args.isPinned) {
    return "pin";
  }
  if (args.isWaitingForApproval) {
    return "waiting-for-approval";
  }
  if (args.status === "completed") {
    return "completed";
  }
  if (args.status === "hitl-approved") {
    return "hitl-approved";
  }
  if (args.status === "hitl-auto-accepted") {
    return "hitl-auto-accepted";
  }
  if (args.status === "hitl-rejected") {
    return "hitl-rejected";
  }
  if (args.status === "hitl-cancelled") {
    return "hitl-cancelled";
  }
  if (args.status === "hitl-timeout") {
    return "hitl-timeout";
  }
  if (args.status === "skipped") {
    return "skipped";
  }
  if (args.status === "failed") {
    return "failed";
  }
  return "none";
}
