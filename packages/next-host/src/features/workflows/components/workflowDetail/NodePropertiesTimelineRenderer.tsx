import type { JSX } from "react";
import { ArrowDown, Bot, Wrench } from "lucide-react";

import { cn } from "@/lib/utils";

import type { NodeInspectorTimelineEntryModel } from "../../lib/workflowDetail/NodeInspectorTelemetryPresenter";

type RenderPillFn = (pill: Readonly<{ label: string; value: string }>, key: string) => JSX.Element;
type RenderJsonBlockFn = (block: Readonly<{ label: string; value: unknown }>, index: number) => JSX.Element;

/**
 * Renders a single conversation/tool timeline entry. Children are rendered recursively as a
 * left-bordered, indented sub-list so the right-side properties panel mirrors the nested
 * structure already used by the execution-tree inspector (one row per tool call, grouped under
 * the LLM turn that emitted them).
 */
export class NodePropertiesTimelineRenderer {
  static render(
    entry: NodeInspectorTimelineEntryModel,
    args: Readonly<{ isLast: boolean; renderPill: RenderPillFn; renderJsonBlock: RenderJsonBlockFn }>,
  ): JSX.Element {
    const { isLast, renderPill, renderJsonBlock } = args;
    const childCount = entry.children?.length ?? 0;
    return (
      <div
        key={entry.key}
        data-testid={`node-properties-timeline-entry-${entry.key}`}
        className={cn("flex gap-3", !isLast && "pb-5")}
      >
        <div className="relative flex w-5 shrink-0 justify-center">
          <div className="mt-1 size-2.5 rounded-full bg-primary/45" />
          {!isLast ? (
            <>
              <div className="absolute top-4 bottom-0 w-px bg-border/80" />
              <ArrowDown className="absolute bottom-0 size-3 bg-card text-muted-foreground/70" />
            </>
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <span
                data-testid={`node-properties-timeline-entry-icon-${entry.key}-${entry.kind}`}
                className="inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-border/70 bg-muted/30"
              >
                {entry.kind === "agent" ? (
                  <Bot className="size-3.5 text-primary" strokeWidth={2.2} />
                ) : (
                  <Wrench className="size-3.5 text-muted-foreground" strokeWidth={2.2} />
                )}
              </span>
              <div className="min-w-0 text-xs font-semibold text-foreground">{entry.title}</div>
            </div>
            {entry.pills?.length ? (
              <div
                data-testid={`node-properties-timeline-entry-pills-${entry.key}`}
                className="ml-auto flex shrink-0 flex-wrap justify-end gap-2"
              >
                {entry.pills.map((pill) => renderPill(pill, `${entry.key}-${pill.label}`))}
              </div>
            ) : null}
          </div>
          {entry.subtitle ? <div className="mt-1 text-[11px] text-muted-foreground">{entry.subtitle}</div> : null}
          {entry.jsonBlocks?.length ? (
            <div className="mt-3 grid gap-3">
              {entry.jsonBlocks.map((block, index) => renderJsonBlock(block, index))}
            </div>
          ) : null}
          {childCount > 0 ? (
            <div
              data-testid={`node-properties-timeline-entry-children-${entry.key}`}
              className="mt-4 ml-2 border-l border-border/60 pl-4"
            >
              {entry.children!.map((child, childIndex) =>
                this.render(child, {
                  isLast: childIndex === childCount - 1,
                  renderPill,
                  renderJsonBlock,
                }),
              )}
            </div>
          ) : null}
        </div>
      </div>
    );
  }
}
