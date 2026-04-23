import {
  Bot,
  Boxes,
  Brain,
  CircleAlert,
  CircleCheckBig,
  Clock3,
  LoaderCircle,
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
    return (
      <LoaderCircle
        size={size}
        style={{ color: "#2563eb", animation: "codemationSpin 1s linear infinite" }}
        strokeWidth={2.1}
      />
    );
  }
  return <Clock3 size={size} style={{ color: "#6b7280" }} strokeWidth={2.1} />;
}

/**
 * Role-only Lucide fallback for a node when no explicit `icon` is set.
 *
 * The previous implementation also guessed by `type` substring (`"wait".includes("ai")` etc.)
 * and duplicated the icon pipeline for the execution tree panel. Both are gone:
 * - Canvas + tree panel now render via {@link WorkflowCanvasNodeIcon}, so `builtin:`,
 *   `si:`, URL and rotated icons all resolve the same way everywhere.
 * - Plugin nodes that forget to set `icon` fall through to `Boxes`, a clear visual
 *   signal to add one — no more silent substring guesses.
 */
export class WorkflowNodeIconResolver {
  static resolveFallback(role?: string): LucideIcon {
    if (role === "agent" || role === "nestedAgent") return Bot;
    if (role === "languageModel") return Brain;
    if (role === "tool") return Wrench;
    return Boxes;
  }
}
