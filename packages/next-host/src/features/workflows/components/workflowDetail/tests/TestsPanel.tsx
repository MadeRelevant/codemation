"use client";

import type { WorkflowNodeDto } from "@codemation/host/dto";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import {
  useStartTestSuiteRunMutation,
  useTestSuiteRunAssertionsQuery,
  useTestSuiteRunChildRunsQuery,
  useTestSuiteRunDetailQuery,
  useWorkflowTestSuiteRunsQuery,
} from "../../../hooks/realtime/testSuiteHooks";

import { TestSuitePassRateChart } from "./TestSuitePassRateChart";
import { TestSuiteRunDetailPanel } from "./TestSuiteRunDetailPanel";
import { TestSuiteRunsList } from "./TestSuiteRunsList";

interface TestsPanelProps {
  readonly workflowId: string;
  readonly workflowNodes: ReadonlyArray<WorkflowNodeDto>;
  readonly autoStartTriggerNodeId?: string;
}

/**
 * Self-contained Tests view rendered when the canvas's "Tests" tab is active. Owns its own
 * selection state for the picked TestSuiteRun (no controller surgery), data loading via
 * dedicated React Query hooks, and the "Run tests" CTA wiring through to the start-suite
 * HTTP route. Charts/labels intentionally call out **rolling-input** Phase 1 semantics.
 */
export function TestsPanel(props: TestsPanelProps) {
  const { workflowId, workflowNodes, autoStartTriggerNodeId } = props;
  const testTriggers = useMemo(
    () => workflowNodes.filter((n) => n.kind === "trigger" && n.triggerKind === "test"),
    [workflowNodes],
  );
  const [selectedTriggerNodeId, setSelectedTriggerNodeId] = useState<string>(testTriggers[0]?.id ?? "");
  const [selectedSuiteRunId, setSelectedSuiteRunId] = useState<string | null>(null);

  const suitesQuery = useWorkflowTestSuiteRunsQuery(workflowId);
  const detailQuery = useTestSuiteRunDetailQuery(selectedSuiteRunId);
  const assertionsQuery = useTestSuiteRunAssertionsQuery(selectedSuiteRunId);
  const childRunsQuery = useTestSuiteRunChildRunsQuery(selectedSuiteRunId);
  const startMutation = useStartTestSuiteRunMutation(workflowId);

  // Auto-start a test suite run if autoStartTriggerNodeId is provided (from canvas run button)
  useEffect(() => {
    if (!autoStartTriggerNodeId) {
      return;
    }
    const trigger = testTriggers.find((t) => t.id === autoStartTriggerNodeId);
    if (!trigger) {
      return;
    }
    setSelectedTriggerNodeId(autoStartTriggerNodeId);
    void (async () => {
      const result = await startMutation.mutateAsync({ triggerNodeId: autoStartTriggerNodeId });
      setSelectedSuiteRunId(result.testSuiteRunId);
    })();
  }, [autoStartTriggerNodeId, startMutation, testTriggers]);

  const onRunTests = async (): Promise<void> => {
    if (!selectedTriggerNodeId) return;
    // Fire-and-forget on the server side: response is "running" with the suite id, so we can
    // immediately navigate to its detail and watch progress via realtime events.
    const result = await startMutation.mutateAsync({ triggerNodeId: selectedTriggerNodeId });
    setSelectedSuiteRunId(result.testSuiteRunId);
  };

  if (testTriggers.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6 py-8 text-sm text-muted-foreground">
        <div className="max-w-md text-center">
          <p className="mb-2 font-semibold">No test triggers in this workflow.</p>
          <p>
            Add a <code className="rounded bg-muted/60 px-1">TestTrigger</code> node to your workflow code (with a
            <code className="rounded bg-muted/60 px-1">generateItems</code> callback) to enable workflow tests.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,360px)_minmax(0,1fr)] overflow-hidden bg-muted/40">
      <aside className="flex h-full min-h-0 flex-col border-r border-border bg-background">
        <header className="border-b border-border px-4 py-3">
          <div className="mb-2 flex items-center gap-2">
            {testTriggers.length > 1 ? (
              // Multi-trigger workflows need the picker. Single-trigger workflows just show
              // the trigger's name as a static label so the UI doesn't ask a needless question.
              <Select value={selectedTriggerNodeId} onValueChange={setSelectedTriggerNodeId}>
                <SelectTrigger
                  data-testid="tests-panel-trigger-picker"
                  className="h-8 flex-1 text-xs"
                  aria-label="Test trigger to run"
                >
                  <SelectValue placeholder="Select a test trigger" />
                </SelectTrigger>
                <SelectContent>
                  {testTriggers.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name ?? t.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <span
                data-testid="tests-panel-single-trigger-label"
                className="flex h-8 flex-1 items-center truncate rounded-md border border-border bg-muted/30 px-2 text-xs font-semibold"
                title={testTriggers[0]?.name ?? testTriggers[0]?.id}
              >
                {testTriggers[0]?.name ?? testTriggers[0]?.id}
              </span>
            )}
            <Button
              type="button"
              data-testid="tests-panel-run-button"
              size="sm"
              className="h-8 px-3 text-xs font-extrabold"
              disabled={!selectedTriggerNodeId || startMutation.isPending}
              onClick={() => {
                void onRunTests();
              }}
            >
              {startMutation.isPending ? "Running…" : "Run tests"}
            </Button>
          </div>
          {startMutation.isError ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1 text-xs text-destructive">
              {startMutation.error?.message ?? "Failed to start tests"}
            </div>
          ) : null}
        </header>
        <div className="border-b border-border px-4 py-3">
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="font-semibold uppercase tracking-wide text-muted-foreground">Pass rate over time</span>
            <span className="text-[10px] text-muted-foreground">rolling-input</span>
          </div>
          <TestSuitePassRateChart suiteRuns={suitesQuery.data ?? []} />
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          {suitesQuery.isLoading ? (
            <div className="px-4 py-6 text-sm text-muted-foreground">Loading test suite runs…</div>
          ) : (
            <TestSuiteRunsList
              suiteRuns={suitesQuery.data ?? []}
              selectedTestSuiteRunId={selectedSuiteRunId}
              onSelect={setSelectedSuiteRunId}
            />
          )}
        </div>
      </aside>
      <main className="min-h-0 overflow-hidden bg-background">
        {selectedSuiteRunId === null ? (
          <div className="flex h-full items-center justify-center px-6 py-8 text-sm text-muted-foreground">
            Select a test suite run to view its details.
          </div>
        ) : detailQuery.isLoading || !detailQuery.data ? (
          <div className="px-6 py-6 text-sm text-muted-foreground">Loading test suite run…</div>
        ) : (
          <TestSuiteRunDetailPanel
            workflowId={workflowId}
            suiteRun={detailQuery.data}
            assertions={assertionsQuery.data ?? []}
            assertionsLoading={assertionsQuery.isLoading}
            childRuns={childRunsQuery.data ?? []}
            childRunsLoading={childRunsQuery.isLoading}
          />
        )}
      </main>
    </div>
  );
}
