// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  WorkflowDetailChromeProvider,
  useWorkflowDetailChrome,
  useWorkflowDetailChromeDispatch,
} from "../../src/shell/WorkflowDetailChromeContext";

// ─── WorkflowDetailChromeContext ──────────────────────────────────────────────

function WorkflowDetailChromeConsumer() {
  const chrome = useWorkflowDetailChrome();
  const dispatch = useWorkflowDetailChromeDispatch();
  return (
    <div>
      <span data-testid="chrome-value">{chrome === null ? "null" : "present"}</span>
      <button
        type="button"
        data-testid="set-chrome"
        onClick={() =>
          dispatch?.({
            workflowIsActive: true,
            isWorkflowActivationPending: false,
            isLiveWorkflowView: true,
            workflowActivationAlertLines: null,
            dismissWorkflowActivationAlert: () => {},
            setWorkflowActive: () => {},
            credentialAttentionSummaryLines: [],
          })
        }
      >
        Set
      </button>
    </div>
  );
}

describe("WorkflowDetailChromeProvider", () => {
  it("provides null chrome state initially", () => {
    render(
      <WorkflowDetailChromeProvider>
        <WorkflowDetailChromeConsumer />
      </WorkflowDetailChromeProvider>,
    );
    expect(screen.getByTestId("chrome-value")).toHaveTextContent("null");
  });

  it("updates chrome state via setChrome dispatch", () => {
    render(
      <WorkflowDetailChromeProvider>
        <WorkflowDetailChromeConsumer />
      </WorkflowDetailChromeProvider>,
    );
    fireEvent.click(screen.getByTestId("set-chrome"));
    expect(screen.getByTestId("chrome-value")).toHaveTextContent("present");
  });

  it("useWorkflowDetailChrome returns null outside a provider", () => {
    function NakedConsumer() {
      const chrome = useWorkflowDetailChrome();
      return <span data-testid="naked-chrome">{chrome === null ? "null" : "has-value"}</span>;
    }
    render(<NakedConsumer />);
    expect(screen.getByTestId("naked-chrome")).toHaveTextContent("null");
  });

  it("useWorkflowDetailChromeDispatch returns null outside a provider", () => {
    function NakedDispatchConsumer() {
      const dispatch = useWorkflowDetailChromeDispatch();
      return <span data-testid="naked-dispatch">{dispatch === null ? "null" : "has-value"}</span>;
    }
    render(<NakedDispatchConsumer />);
    expect(screen.getByTestId("naked-dispatch")).toHaveTextContent("null");
  });
});

// ─── AppMainContent ───────────────────────────────────────────────────────────
// AppMainContent uses usePathname — test the visible output by checking that the
// children are rendered correctly.
//
// AppLayout renders AppLayoutNavItems (which uses usePathname + useWorkflowsQuery),
// making it unsuitable for plain jsdom rendering without full Next.js router context.
// The sidebar toggle / resize logic is a class component with localStorage calls;
// these are covered via integration-style tests at the consumer level (e2e).
// Document the exclusion here for clarity.
//
// Excluded: AppLayout — calls usePathname/useWorkflowsQuery transitively.
// Excluded: AppMainContent — wraps children only; calls usePathname.
// Excluded: AppLayoutNavItems — calls usePathname + canvas hooks.
// Excluded: AppLayoutPageHeader — calls usePathname + multiple canvas hooks.
