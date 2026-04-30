import type { JSX } from "react";
import { ChevronDown, CircleCheckBig, Clock3, LoaderCircle, X } from "lucide-react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

import type {
  NodeInspectorJsonBlockModel,
  NodeInspectorSectionModel,
  NodeInspectorTableModel,
  NodeInspectorTimelineEntryModel,
} from "../../lib/workflowDetail/NodeInspectorTelemetryPresenter";
import { NodePropertiesSectionNavigationButtons } from "./NodePropertiesSectionNavigationButtons";
import { NodePropertiesTimelineRenderer } from "./NodePropertiesTimelineRenderer";

export class NodePropertiesSectionRenderer {
  static renderPill(pill: Readonly<{ label: string; value: string }>, key: string): JSX.Element {
    if (pill.label === "Status") {
      return this.renderStatusPill(pill.value, key);
    }
    return (
      <span
        key={key}
        className="inline-flex items-center rounded-full border border-border/70 bg-muted/40 px-2.5 py-1 text-[11px] font-semibold text-foreground"
      >
        <span className="mr-1.5 text-muted-foreground">{pill.label}</span>
        <span>{pill.value}</span>
      </span>
    );
  }

  static renderStatusPill(status: string, key: string): JSX.Element {
    const normalized = status.toLowerCase();
    if (normalized === "completed") {
      return (
        <span
          key={key}
          className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-300"
        >
          <CircleCheckBig className="size-3.5" strokeWidth={2.4} />
          <span>{status}</span>
        </span>
      );
    }
    if (normalized === "failed") {
      return (
        <span
          key={key}
          className="inline-flex items-center gap-1.5 rounded-full border border-destructive/30 bg-destructive/10 px-2.5 py-1 text-[11px] font-bold text-destructive"
        >
          <X className="size-3.5 stroke-[3]" />
          <span>{status}</span>
        </span>
      );
    }
    if (normalized === "running" || normalized === "queued") {
      return (
        <span
          key={key}
          className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary"
        >
          <LoaderCircle className="size-3.5 animate-spin" strokeWidth={2.4} />
          <span>{status}</span>
        </span>
      );
    }
    return (
      <span
        key={key}
        className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-muted/40 px-2.5 py-1 text-[11px] font-bold text-foreground"
      >
        <Clock3 className="size-3.5 text-muted-foreground" strokeWidth={2.2} />
        <span>{status}</span>
      </span>
    );
  }

  static renderJsonBlock(block: NodeInspectorJsonBlockModel, index: number): JSX.Element {
    return (
      <div key={`${block.label}-${String(index)}`} className="grid gap-1">
        <div className="text-[11px] font-bold tracking-wide text-muted-foreground uppercase">{block.label}</div>
        <pre className="max-h-56 overflow-auto rounded-md border border-border/70 bg-muted/30 p-2 text-[11px] leading-5 text-foreground whitespace-pre-wrap break-words">
          {JSON.stringify(block.value, null, 2)}
        </pre>
      </div>
    );
  }

  static renderTable(table: NodeInspectorTableModel): JSX.Element {
    return (
      <div className="overflow-auto rounded-md border border-border/70 bg-background/70">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-muted/40">
            <tr>
              {table.columns.map((column) => (
                <th key={column} className="px-2 py-2 font-bold text-foreground">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, rowIndex) => (
              <tr key={`${rowIndex}-${table.columns.join("-")}`} className="border-t">
                {table.columns.map((column) => (
                  <td key={`${rowIndex}-${column}`} className="px-2 py-2 align-top text-muted-foreground">
                    {row[column] ?? "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  static renderTimelineEntry(entry: NodeInspectorTimelineEntryModel, args: Readonly<{ isLast: boolean }>): JSX.Element {
    return NodePropertiesTimelineRenderer.render(entry, {
      isLast: args.isLast,
      renderPill: (pill, key) => this.renderPill(pill, key),
      renderJsonBlock: (block, index) => this.renderJsonBlock(block, index),
    });
  }

  static render(
    props: Readonly<{
      section: NodeInspectorSectionModel;
      isOpen: boolean;
      onToggle: (isOpen: boolean) => void;
      isLastSection: boolean;
      onSelectInvocation?: (invocationId: string) => void;
    }>,
  ): JSX.Element {
    const { section, isOpen, onToggle, isLastSection, onSelectInvocation } = props;
    return (
      <div
        key={section.id}
        data-testid={`node-properties-section-${section.id}`}
        className={cn(!isLastSection && "border-b border-border/60")}
      >
        <Collapsible open={isOpen} onOpenChange={onToggle}>
          <div className="flex w-full items-center gap-1">
            <CollapsibleTrigger className="group flex min-w-0 flex-1 items-center justify-between gap-3 py-3 text-left">
              <div className="min-w-0">
                <div className="text-[11px] font-extrabold tracking-wide text-muted-foreground uppercase">
                  {section.title}
                </div>
              </div>
              <ChevronDown
                className={cn(
                  "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
                  isOpen && "rotate-180",
                )}
              />
            </CollapsibleTrigger>
            {section.navigation
              ? NodePropertiesSectionNavigationButtons.render({
                  sectionId: section.id,
                  navigation: section.navigation,
                  onSelectInvocation,
                })
              : null}
          </div>
          <CollapsibleContent
            forceMount
            className="grid overflow-hidden transition-[grid-template-rows,opacity] duration-200 ease-out data-[state=closed]:grid-rows-[0fr] data-[state=closed]:opacity-0 data-[state=open]:grid-rows-[1fr] data-[state=open]:opacity-100"
          >
            <div className="overflow-hidden pb-4">
              {section.breadcrumb ? (
                <p
                  data-testid={`node-properties-section-breadcrumb-${section.id}`}
                  className="mb-3 text-[11px] font-semibold text-muted-foreground"
                >
                  {section.breadcrumb.text}
                </p>
              ) : null}
              {section.description ? (
                <p className="mb-3 text-xs leading-5 text-muted-foreground">{section.description}</p>
              ) : null}
              {section.pills?.length ? (
                <div className="flex flex-wrap gap-2">
                  {section.pills.map((pill) => this.renderPill(pill, `${section.id}-${pill.label}`))}
                </div>
              ) : null}
              {section.keyValues?.length ? (
                <div className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
                  {section.keyValues.map((entry) => (
                    <div key={`${section.id}-${entry.label}`} className="grid gap-1">
                      <div className="font-bold text-muted-foreground">{entry.label}</div>
                      <div className="text-foreground">{entry.value}</div>
                    </div>
                  ))}
                </div>
              ) : null}
              {section.table ? <div className="mt-3">{this.renderTable(section.table)}</div> : null}
              {section.timeline?.length ? (
                <div className="mt-4">
                  {section.timeline.map((entry, index) =>
                    this.renderTimelineEntry(entry, { isLast: index === section.timeline!.length - 1 }),
                  )}
                </div>
              ) : null}
              {section.jsonBlocks?.length ? (
                <div className="mt-3 grid gap-3">
                  {section.jsonBlocks.map((block, index) => this.renderJsonBlock(block, index))}
                </div>
              ) : null}
              {!section.pills?.length &&
              !section.keyValues?.length &&
              !section.table &&
              !section.timeline?.length &&
              !section.jsonBlocks?.length &&
              section.emptyLabel ? (
                <div className="mt-3 rounded-md border border-border/70 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  {section.emptyLabel}
                </div>
              ) : null}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    );
  }
}
