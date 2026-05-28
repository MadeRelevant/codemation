// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";

import type { HumanTaskRecord } from "../../src/server/devInboxComposition";
import { DevInboxTable } from "../../app/(shell)/dev/inbox/DevInboxTable";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTask(overrides: Partial<HumanTaskRecord> = {}): HumanTaskRecord {
  return {
    id: "task-001",
    runId: "run-001",
    workflowId: "wf-001",
    nodeId: "node-approval",
    activationId: "act-001",
    itemIndex: 0,
    status: "pending",
    channel: "local",
    subject: { title: "Review payout", summary: "Check the payment request." },
    metadata: {},
    decisionSchemaJson: "{}",
    decisionSchemaHash: "abc123",
    onTimeout: "halt",
    resumeTokenHash: "tok-hash",
    expiresAt: new Date("2099-01-01T00:00:00Z"),
    createdAt: new Date("2024-01-01T00:00:00Z"),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DevInboxTable", () => {
  it("shows empty message when tasks array is empty", () => {
    render(<DevInboxTable tasks={[]} />);
    expect(screen.getByText("No pending tasks.")).toBeTruthy();
  });

  it("renders a row per task with title and summary", () => {
    const tasks = [
      makeTask({ id: "t1", subject: { title: "Approve A", summary: "Summary A" } }),
      makeTask({ id: "t2", subject: { title: "Approve B", summary: "Summary B" } }),
    ];
    render(<DevInboxTable tasks={tasks} />);

    expect(screen.getByText("Approve A")).toBeTruthy();
    expect(screen.getByText("Summary A")).toBeTruthy();
    expect(screen.getByText("Approve B")).toBeTruthy();
  });

  it("renders Approve and Reject buttons for each task", () => {
    render(<DevInboxTable tasks={[makeTask()]} />);
    expect(screen.getAllByText("Approve").length).toBe(1);
    expect(screen.getAllByText("Reject").length).toBe(1);
  });

  it("expands JSON detail panel when task title is clicked", () => {
    render(<DevInboxTable tasks={[makeTask({ id: "task-expand" })]} />);
    const titleButton = screen.getByText("Review payout");
    fireEvent.click(titleButton);
    expect(screen.getByText(/task-expand/)).toBeTruthy();
  });

  describe("decide action", () => {
    beforeEach(() => {
      globalThis.fetch = vi.fn();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("calls /api/hitl/tasks/:id/decide with approved=true on Approve click", async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      globalThis.fetch = mockFetch;

      render(<DevInboxTable tasks={[makeTask({ id: "task-approve" })]} />);
      fireEvent.click(screen.getByText("Approve"));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          "/api/hitl/tasks/task-approve/decide",
          expect.objectContaining({
            method: "POST",
            body: JSON.stringify({ decision: { approved: true } }),
          }),
        );
      });
    });

    it("calls /api/hitl/tasks/:id/decide with approved=false on Reject click", async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      globalThis.fetch = mockFetch;

      render(<DevInboxTable tasks={[makeTask({ id: "task-reject" })]} />);
      fireEvent.click(screen.getByText("Reject"));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          "/api/hitl/tasks/task-reject/decide",
          expect.objectContaining({
            method: "POST",
            body: JSON.stringify({ decision: { approved: false } }),
          }),
        );
      });
    });

    it("fires a success toast after a successful Approve", async () => {
      const successSpy = vi.spyOn(toast, "success").mockImplementation(() => "toast-id");
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      globalThis.fetch = mockFetch;

      render(<DevInboxTable tasks={[makeTask({ id: "task-toast-approve" })]} />);
      fireEvent.click(screen.getByText("Approve"));

      await waitFor(() => {
        expect(successSpy).toHaveBeenCalledWith("Task approved");
      });
    });

    it("fires a success toast after a successful Reject", async () => {
      const successSpy = vi.spyOn(toast, "success").mockImplementation(() => "toast-id");
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      globalThis.fetch = mockFetch;

      render(<DevInboxTable tasks={[makeTask({ id: "task-toast-reject" })]} />);
      fireEvent.click(screen.getByText("Reject"));

      await waitFor(() => {
        expect(successSpy).toHaveBeenCalledWith("Task rejected");
      });
    });

    it("fires an error toast with the server message when the API call fails", async () => {
      const errorSpy = vi.spyOn(toast, "error").mockImplementation(() => "toast-id");
      const mockFetch = vi.fn().mockResolvedValue({ ok: false, text: async () => "task not found" });
      globalThis.fetch = mockFetch;

      render(<DevInboxTable tasks={[makeTask({ id: "task-fail" })]} />);
      fireEvent.click(screen.getByText("Approve"));

      await waitFor(() => {
        expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("task not found"));
      });
    });
  });
});
