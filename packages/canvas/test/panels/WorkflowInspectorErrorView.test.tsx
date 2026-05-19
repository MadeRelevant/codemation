// @vitest-environment jsdom

import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

import { WorkflowInspectorErrorView } from "../../src/panels/WorkflowInspectorErrorView";
import type { NodeExecutionError } from "@codemation/canvas";

type _ClipboardDescriptor = PropertyDescriptor & { value: Clipboard };

// Save original clipboard descriptor so we can restore it after each test
let originalClipboardDescriptor: PropertyDescriptor | undefined;

beforeEach(() => {
  originalClipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
});

afterEach(() => {
  if (originalClipboardDescriptor) {
    Object.defineProperty(navigator, "clipboard", originalClipboardDescriptor);
  } else {
    // If there was no descriptor, delete the property
    try {
      // @ts-expect-error restoring
      delete navigator.clipboard;
    } catch {
      // ignore
    }
  }
  vi.useRealTimers();
});

function installClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    writable: true,
    value: { writeText },
  });
}

function makeError(overrides: Partial<NodeExecutionError> = {}): NodeExecutionError {
  return {
    message: "Something went wrong",
    stack: "Error: Something went wrong\n  at foo (bar.ts:1:1)",
    ...overrides,
  };
}

const baseArgs = {
  emptyLabel: "No error to display",
  getErrorHeadline: (e: NodeExecutionError | undefined) => e?.message ?? "Unknown",
  getErrorStack: (e: NodeExecutionError | undefined) => e?.stack ?? null,
  getErrorClipboardText: (e: NodeExecutionError | undefined) => e?.message ?? "",
};

describe("WorkflowInspectorErrorView — empty state", () => {
  it("renders emptyLabel when error is undefined", () => {
    render(<WorkflowInspectorErrorView {...baseArgs} error={undefined} />);
    expect(screen.getByTestId("workflow-inspector-empty-state")).toBeInTheDocument();
    expect(screen.getByText("No error to display")).toBeInTheDocument();
  });
});

describe("WorkflowInspectorErrorView — error state", () => {
  it("renders error headline when error is provided", () => {
    render(<WorkflowInspectorErrorView {...baseArgs} error={makeError()} />);
    expect(screen.getByTestId("workflow-inspector-error-headline")).toBeInTheDocument();
    expect(screen.getByTestId("workflow-inspector-error-headline").textContent).toContain("Something went wrong");
  });

  it("shows 'Full stacktrace' when stack is present", () => {
    render(<WorkflowInspectorErrorView {...baseArgs} error={makeError({ stack: "some stack" })} />);
    expect(screen.getByText("Full stacktrace")).toBeInTheDocument();
  });

  it("shows 'No stacktrace was captured' when stack is null", () => {
    const argsNoStack = {
      ...baseArgs,
      getErrorStack: () => null,
    };
    render(<WorkflowInspectorErrorView {...argsNoStack} error={makeError()} />);
    expect(screen.getByText("No stacktrace was captured for this error.")).toBeInTheDocument();
  });

  it("initially shows Copy button text (not Copied)", () => {
    render(<WorkflowInspectorErrorView {...baseArgs} error={makeError()} />);
    expect(screen.getByText("Copy stacktrace")).toBeInTheDocument();
    expect(screen.queryByText("Copied")).not.toBeInTheDocument();
  });

  it("transitions copy button to Copied then back to idle after 1500ms", async () => {
    vi.useFakeTimers();
    let resolveCopy: () => void;
    const writeText = () =>
      new Promise<void>((resolve) => {
        resolveCopy = resolve;
      });
    installClipboard(writeText);

    render(<WorkflowInspectorErrorView {...baseArgs} error={makeError()} />);

    const copyBtn = screen.getByText("Copy stacktrace").closest("button")!;
    await act(async () => {
      fireEvent.click(copyBtn);
    });

    // Resolve the clipboard promise
    await act(async () => {
      resolveCopy();
    });

    expect(screen.getByText("Copied")).toBeInTheDocument();

    // Advance timer past 1500ms
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });

    expect(screen.getByText("Copy stacktrace")).toBeInTheDocument();
    expect(screen.queryByText("Copied")).not.toBeInTheDocument();
  });

  it("renders structured details section when error.details is provided", () => {
    const error = makeError({ details: { key: "value" } });
    render(<WorkflowInspectorErrorView {...baseArgs} error={error} />);
    expect(screen.getByText("Structured details")).toBeInTheDocument();
  });

  it("does not render structured details section when error.details is absent", () => {
    render(<WorkflowInspectorErrorView {...baseArgs} error={makeError()} />);
    expect(screen.queryByText("Structured details")).not.toBeInTheDocument();
  });
});
