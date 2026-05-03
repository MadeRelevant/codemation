import { FlaskConical } from "lucide-react";

import type { WorkflowDiagramNode } from "../../lib/workflowDetail/workflowDetailTypes";

/**
 * Renders the author-supplied `description` for a node in the properties panel — currently
 * the primary use case is `TestTrigger` ("emails from label X, ~14 messages") so authors
 * revisiting a workflow six months later remember which fixture source the test cases pull
 * from. Generic enough to surface on any node config that exposes a `description: string`.
 */
export function NodePropertiesDescriptionSection(args: Readonly<{ node: WorkflowDiagramNode }>) {
  const description = args.node.description;
  if (typeof description !== "string" || description.trim().length === 0) {
    return null;
  }
  const isTestTrigger = args.node.kind === "trigger" && args.node.triggerKind === "test";
  return (
    <section data-testid="node-properties-description-section" className="border-b border-border bg-muted/20 px-3 py-3">
      <div className="flex items-center gap-1.5 text-[11px] font-extrabold tracking-wide text-muted-foreground uppercase opacity-80">
        {isTestTrigger ? <FlaskConical size={12} strokeWidth={2.5} /> : null}
        {isTestTrigger ? "Test cases come from" : "Description"}
      </div>
      <p className="mt-2 text-xs leading-relaxed text-foreground whitespace-pre-wrap">{description}</p>
    </section>
  );
}
