"use client";

import { useMemo } from "react";
import ChevronDown from "lucide-react/dist/esm/icons/chevron-down";

import { Button } from "../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "../components/ui/dropdown-menu";
import { cn } from "../components/lib/utils";

interface Trigger {
  readonly nodeId: string;
  readonly name: string;
  readonly kind: "live" | "test";
}

interface WorkflowCanvasRunButtonProps {
  readonly triggers: ReadonlyArray<Trigger>;
  readonly selectedTriggerNodeId: string | null;
  readonly isRunning?: boolean;
  readonly disabled?: boolean;
  readonly onSelect: (nodeId: string) => void;
  readonly onRunLive: (nodeId: string) => void;
  readonly onRunTest: (nodeId: string) => void;
}

/**
 * Split button for running a workflow from the canvas.
 * Primary button runs the selected/default trigger immediately.
 * Chevron dropdown allows picking a different trigger (live or test).
 */
export function WorkflowCanvasRunButton(props: WorkflowCanvasRunButtonProps) {
  const {
    triggers,
    selectedTriggerNodeId,
    isRunning = false,
    disabled = false,
    onSelect,
    onRunLive,
    onRunTest,
  } = props;

  // Find selected trigger or fall back to default
  const selectedTrigger = useMemo(() => {
    if (!selectedTriggerNodeId) {
      return null;
    }
    return triggers.find((t) => t.nodeId === selectedTriggerNodeId) ?? null;
  }, [selectedTriggerNodeId, triggers]);

  const defaultTrigger = useMemo(() => {
    // Priority: manual > webhook > cron > polling > ... > test-last
    // First find live triggers
    const liveTriggers = triggers.filter((t) => t.kind === "live");
    if (liveTriggers.length > 0) {
      return liveTriggers[0];
    }
    // Fall back to test triggers
    return triggers[0] ?? null;
  }, [triggers]);

  const activeTrigger = selectedTrigger || defaultTrigger;

  const handleRunClick = () => {
    if (!activeTrigger) {
      return;
    }
    if (activeTrigger.kind === "test") {
      onRunTest(activeTrigger.nodeId);
    } else {
      onRunLive(activeTrigger.nodeId);
    }
  };

  const handleSelectTrigger = (nodeId: string) => {
    const trigger = triggers.find((t) => t.nodeId === nodeId);
    if (!trigger) {
      return;
    }
    onSelect(nodeId);
    // Auto-run on selection
    if (trigger.kind === "test") {
      onRunTest(trigger.nodeId);
    } else {
      onRunLive(trigger.nodeId);
    }
  };

  const liveTriggers = triggers.filter((t) => t.kind === "live");
  const testTriggers = triggers.filter((t) => t.kind === "test");

  return (
    <div className="pointer-events-auto flex gap-1">
      <Button
        type="button"
        data-testid="canvas-run-workflow-button"
        size="sm"
        className="h-8 px-3 text-xs font-extrabold"
        onClick={handleRunClick}
        disabled={disabled || isRunning}
      >
        {isRunning ? "Running..." : "Run workflow"}
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            data-testid="canvas-run-workflow-trigger-picker"
            size="sm"
            variant="outline"
            className={cn("h-8 w-8 px-0", disabled && "opacity-50 pointer-events-none")}
            disabled={disabled}
            aria-label="Select trigger to run"
          >
            <ChevronDown className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="min-w-48">
          {liveTriggers.length > 0 && (
            <>
              <DropdownMenuLabel className="text-xs">Live Triggers</DropdownMenuLabel>
              {liveTriggers.map((trigger) => (
                <DropdownMenuItem
                  key={trigger.nodeId}
                  onSelect={() => {
                    handleSelectTrigger(trigger.nodeId);
                  }}
                  className="cursor-pointer"
                >
                  <div className="flex flex-1 items-center justify-between gap-2">
                    <span className="truncate text-sm">{trigger.name}</span>
                    <span className="shrink-0 rounded-sm bg-primary/20 px-1.5 py-0.5 text-xs font-medium text-primary">
                      Live
                    </span>
                  </div>
                </DropdownMenuItem>
              ))}
            </>
          )}

          {testTriggers.length > 0 && liveTriggers.length > 0 && <DropdownMenuSeparator />}

          {testTriggers.length > 0 && (
            <>
              {liveTriggers.length > 0 && <DropdownMenuLabel className="text-xs">Test Triggers</DropdownMenuLabel>}
              {testTriggers.map((trigger) => (
                <DropdownMenuItem
                  key={trigger.nodeId}
                  onSelect={() => {
                    handleSelectTrigger(trigger.nodeId);
                  }}
                  className="cursor-pointer"
                >
                  <div className="flex flex-1 items-center justify-between gap-2">
                    <span className="truncate text-sm">{trigger.name}</span>
                    <span className="shrink-0 rounded-sm bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                      Test
                    </span>
                  </div>
                </DropdownMenuItem>
              ))}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
