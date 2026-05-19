// @vitest-environment jsdom

import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CredentialFieldCopyButton } from "../../src/features/credentials/components/CredentialFieldCopyButton";

// Save original clipboard descriptor so we can fully restore it between tests.
const originalClipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");

function installClipboard(impl: { writeText: ReturnType<typeof vi.fn> }) {
  Object.defineProperty(navigator, "clipboard", {
    value: impl,
    configurable: true,
    writable: true,
  });
}

function restoreClipboard() {
  if (originalClipboardDescriptor) {
    Object.defineProperty(navigator, "clipboard", originalClipboardDescriptor);
  } else {
    // Navigator.clipboard was not originally own — remove the override.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (navigator as any).clipboard;
  }
}

describe("CredentialFieldCopyButton", () => {
  let writeText: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    writeText = vi.fn().mockResolvedValue(undefined);
    installClipboard({ writeText });
    vi.useFakeTimers();
  });

  afterEach(() => {
    restoreClipboard();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("is disabled when value is empty", () => {
    render(<CredentialFieldCopyButton value="" testId="copy-btn" />);
    expect(screen.getByTestId("copy-btn")).toBeDisabled();
  });

  it("is disabled when value is whitespace-only", () => {
    render(<CredentialFieldCopyButton value="   " testId="copy-btn" />);
    expect(screen.getByTestId("copy-btn")).toBeDisabled();
  });

  it("calls clipboard.writeText on click and shows Copied", async () => {
    render(<CredentialFieldCopyButton value="hello-world" testId="copy-btn" />);

    const btn = screen.getByTestId("copy-btn");
    expect(btn).not.toBeDisabled();

    // Flush the async writeText promise inside act so React state updates are captured.
    await act(async () => {
      fireEvent.click(btn);
      // Flush pending microtasks (resolves the writeText promise).
      await Promise.resolve();
    });

    expect(writeText).toHaveBeenCalledWith("hello-world");
    expect(btn).toHaveTextContent("Copied");
  });

  it("resets Copied back to the default label after 1600 ms", async () => {
    render(<CredentialFieldCopyButton value="hello-world" testId="copy-btn" label="Copy" />);
    const btn = screen.getByTestId("copy-btn");

    await act(async () => {
      fireEvent.click(btn);
      await Promise.resolve();
    });

    expect(btn).toHaveTextContent("Copied");

    // Advance past the 1600 ms reset timeout.
    act(() => {
      vi.advanceTimersByTime(1600);
    });

    expect(btn).toHaveTextContent("Copy");
  });

  it("stays as default label when clipboard write fails", async () => {
    writeText.mockRejectedValue(new Error("clipboard denied"));
    installClipboard({ writeText });

    render(<CredentialFieldCopyButton value="hello-world" testId="copy-btn" label="Copy" />);
    const btn = screen.getByTestId("copy-btn");

    // The catch block swallows the error and calls setCopied(false) — label should stay "Copy".
    await act(async () => {
      fireEvent.click(btn);
      await Promise.resolve();
    });

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(btn).toHaveTextContent("Copy");
  });

  it("renders a custom label when provided", () => {
    render(<CredentialFieldCopyButton value="x" testId="copy-btn" label="Copy URI" />);
    expect(screen.getByTestId("copy-btn")).toHaveTextContent("Copy URI");
  });
});
