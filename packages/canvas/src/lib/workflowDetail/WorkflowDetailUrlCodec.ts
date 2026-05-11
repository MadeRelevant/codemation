const RUN_PARAM = "run";
const PANE_PARAM = "pane";
const NODE_PARAM = "node";

export type WorkflowDetailUrlLocation = Readonly<{
  selectedRunId: string | null;
  isRunsPaneVisible: boolean;
  nodeId: string | null;
}>;

/** Minimal surface for `URLSearchParams` / Next `ReadonlyURLSearchParams`. */
export type WorkflowDetailSearchParamsInput = Readonly<{
  get(name: string): string | null;
  toString(): string;
}>;

/**
 * Encodes and decodes workflow detail shareable query params (`run`, `pane`, `node`).
 */
export class WorkflowDetailUrlCodec {
  static parseSearchParams(searchParams: WorkflowDetailSearchParamsInput): WorkflowDetailUrlLocation {
    const runRaw = searchParams.get(RUN_PARAM);
    const selectedRunId = runRaw !== null && runRaw.trim() !== "" ? runRaw.trim() : null;
    const paneRaw = searchParams.get(PANE_PARAM);
    const pane: "live" | "executions" | null = paneRaw === "live" || paneRaw === "executions" ? paneRaw : null;
    const nodeRaw = searchParams.get(NODE_PARAM);
    const nodeId = nodeRaw !== null && nodeRaw.trim() !== "" ? nodeRaw.trim() : null;
    const isRunsPaneVisible = selectedRunId !== null || pane === "executions";
    return {
      selectedRunId,
      isRunsPaneVisible,
      nodeId,
    };
  }

  /**
   * Copies `base`, removes workflow-detail keys, then applies `location`.
   * Preserves unrelated query keys (e.g. future filters).
   */
  static mergeLocationIntoSearchParams(base: URLSearchParams, location: WorkflowDetailUrlLocation): URLSearchParams {
    const next = new URLSearchParams(base.toString());
    next.delete(RUN_PARAM);
    next.delete(PANE_PARAM);
    next.delete(NODE_PARAM);
    if (location.selectedRunId) {
      next.set(RUN_PARAM, location.selectedRunId);
    } else if (location.isRunsPaneVisible) {
      next.set(PANE_PARAM, "executions");
    }
    if (location.nodeId) {
      next.set(NODE_PARAM, location.nodeId);
    }
    return next;
  }

  static toQueryString(searchParams: URLSearchParams): string {
    const s = searchParams.toString();
    return s;
  }

  static buildHref(
    pathname: string,
    base: WorkflowDetailSearchParamsInput,
    location: WorkflowDetailUrlLocation,
  ): string {
    const merged = WorkflowDetailUrlCodec.mergeLocationIntoSearchParams(new URLSearchParams(base.toString()), location);
    const qs = merged.toString();
    return qs.length > 0 ? `${pathname}?${qs}` : pathname;
  }
}
