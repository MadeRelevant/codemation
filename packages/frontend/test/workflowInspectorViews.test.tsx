import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkflowDetailPresenter } from "../src/routes/workflowDetail/WorkflowDetailPresenter";
import { WorkflowInspectorErrorView, WorkflowInspectorJsonView, WorkflowInspectorPrettyView } from "../src/routes/workflowDetail/WorkflowInspectorViews";

describe("workflow inspector views", () => {
  beforeEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      writable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders multiline values in the pretty inspector with preserved line breaks", async () => {
    render(<WorkflowInspectorPrettyView value={{ body: "Body line 1\nBody line 2" }} emptyLabel="No value" />);

    const multilineBody = await screen.findByTestId("pretty-json-multiline-pretty-root.body");
    expect(multilineBody).toHaveStyle({ whiteSpace: "pre-wrap" });
    expect(multilineBody).toHaveTextContent("Body line 1");
  });

  it("renders structured values in the json inspector", () => {
    render(<WorkflowInspectorJsonView value={{ body: "Body line 1", metadata: { source: "test" } }} emptyLabel="No value" />);

    expect(screen.getByTestId("workflow-inspector-json-copy-hint")).toBeInTheDocument();
    expect(screen.getByTestId("workflow-inspector-json-panel")).toHaveTextContent("Body line 1");
  });

  it("renders error details and copies the stacktrace", async () => {
    const clipboard = navigator.clipboard as Clipboard & { writeText: ReturnType<typeof vi.fn> };

    render(
      <WorkflowInspectorErrorView
        error={{
          name: "NodeExecutionError",
          message: "Execution failed while rendering preview output.",
          stack: "Execution failed while rendering preview output.\nReason: upstream API rejected the payload.",
        }}
        emptyLabel="No error"
        getErrorHeadline={WorkflowDetailPresenter.getErrorHeadline.bind(WorkflowDetailPresenter)}
        getErrorStack={WorkflowDetailPresenter.getErrorStack.bind(WorkflowDetailPresenter)}
        getErrorClipboardText={WorkflowDetailPresenter.getErrorClipboardText.bind(WorkflowDetailPresenter)}
      />,
    );

    expect(screen.getByTestId("workflow-inspector-error-headline")).toHaveTextContent(
      "NodeExecutionError: Execution failed while rendering preview output.",
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy stacktrace" }));

    expect(clipboard.writeText).toHaveBeenCalledWith(
      "NodeExecutionError: Execution failed while rendering preview output.\n\nExecution failed while rendering preview output.\nReason: upstream API rejected the payload.",
    );
  });
});
