import {
Bot,
Boxes,
Brain,
CircleAlert,
CircleCheckBig,
Clock3,
GitBranch,
Globe,
LoaderCircle,
PlaySquare,
SquareStack,
Workflow,
Wrench,
type LucideIcon,
} from "lucide-react";

export function WorkflowStatusIcon(args: Readonly<{ status: string; size?: number }>) {
  const { status, size = 16 } = args;
  if (status === "completed") {
    return <CircleCheckBig size={size} style={{ color: "#15803d" }} strokeWidth={2.1} />;
  }
  if (status === "failed") {
    return <CircleAlert size={size} style={{ color: "#b91c1c" }} strokeWidth={2.1} />;
  }
  if (status === "running" || status === "queued") {
    return <LoaderCircle size={size} style={{ color: "#2563eb", animation: "codemationSpin 1s linear infinite" }} strokeWidth={2.1} />;
  }
  return <Clock3 size={size} style={{ color: "#6b7280" }} strokeWidth={2.1} />;
}

export class WorkflowNodeIconResolver {
  static resolveFallback(type: string, role?: string, icon?: string): LucideIcon {
    if (icon?.toLowerCase() === "globe") return Globe;
    if (role === "agent") return Bot;
    if (role === "languageModel") return Brain;
    if (role === "tool") return Wrench;
    const normalizedType = type.toLowerCase();
    if (normalizedType.includes("if")) return GitBranch;
    if (normalizedType.includes("subworkflow")) return Workflow;
    if (normalizedType.includes("map")) return SquareStack;
    if (normalizedType.includes("trigger")) return PlaySquare;
    if (normalizedType.includes("agent") || normalizedType.includes("ai")) return Bot;
    return Boxes;
  }
}
