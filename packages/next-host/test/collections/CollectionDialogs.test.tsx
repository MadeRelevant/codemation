// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CollectionBulkDeleteDialog } from "../../src/features/collections/components/CollectionBulkDeleteDialog";
import { CollectionDeleteRowDialog } from "../../src/features/collections/components/CollectionDeleteRowDialog";

/**
 * Radix Dialog needs pointer capture stubs to open in jsdom.
 */
function installDialogPolyfills(): void {
  if (typeof window === "undefined") return;
  if (typeof Element.prototype.hasPointerCapture !== "function") {
    Element.prototype.hasPointerCapture = (): boolean => false;
  }
  if (typeof Element.prototype.setPointerCapture !== "function") {
    Element.prototype.setPointerCapture = (): void => {};
  }
  if (typeof Element.prototype.releasePointerCapture !== "function") {
    Element.prototype.releasePointerCapture = (): void => {};
  }
  if (typeof Element.prototype.scrollIntoView !== "function") {
    Element.prototype.scrollIntoView = (): void => {};
  }
}
installDialogPolyfills();

// ─── CollectionBulkDeleteDialog ───────────────────────────────────────────────

describe("CollectionBulkDeleteDialog", () => {
  function renderBulkDeleteDialog(overrides: Partial<Parameters<typeof CollectionBulkDeleteDialog>[0]> = {}) {
    const props = {
      open: true,
      collectionName: "users",
      selectedCount: 3,
      isPending: false,
      onCancel: () => {},
      onConfirm: () => {},
      ...overrides,
    };
    return render(<CollectionBulkDeleteDialog {...props} />);
  }

  it("renders when open=true", () => {
    renderBulkDeleteDialog();
    expect(screen.getByTestId("collection-bulk-delete-dialog")).toBeInTheDocument();
  });

  it("does not render content when open=false", () => {
    renderBulkDeleteDialog({ open: false });
    expect(screen.queryByTestId("collection-bulk-delete-dialog")).not.toBeInTheDocument();
  });

  it("uses 'row' (singular) when selectedCount is 1", () => {
    renderBulkDeleteDialog({ selectedCount: 1 });
    expect(screen.getByTestId("collection-bulk-delete-dialog")).toHaveTextContent("Delete 1 row?");
  });

  it("uses 'rows' (plural) when selectedCount > 1", () => {
    renderBulkDeleteDialog({ selectedCount: 5 });
    expect(screen.getByTestId("collection-bulk-delete-dialog")).toHaveTextContent("Delete 5 rows?");
  });

  it("calls onConfirm when confirm button is clicked", () => {
    let confirmed = false;
    renderBulkDeleteDialog({
      onConfirm: () => {
        confirmed = true;
      },
    });
    fireEvent.click(screen.getByTestId("collection-bulk-delete-confirm"));
    expect(confirmed).toBe(true);
  });

  it("disables buttons when isPending", () => {
    renderBulkDeleteDialog({ isPending: true });
    expect(screen.getByTestId("collection-bulk-delete-confirm")).toBeDisabled();
  });

  it("shows 'Deleting N…' text while pending", () => {
    renderBulkDeleteDialog({ selectedCount: 2, isPending: true });
    expect(screen.getByTestId("collection-bulk-delete-confirm")).toHaveTextContent("Deleting 2…");
  });
});

// ─── CollectionDeleteRowDialog ────────────────────────────────────────────────

describe("CollectionDeleteRowDialog", () => {
  const sampleRow = { id: "row-123", data: {} };

  function renderDeleteRowDialog(overrides: Partial<Parameters<typeof CollectionDeleteRowDialog>[0]> = {}) {
    const props = {
      row: sampleRow,
      isPending: false,
      onCancel: () => {},
      onConfirm: () => {},
      ...overrides,
    };
    return render(<CollectionDeleteRowDialog {...props} />);
  }

  it("renders when row is not null", () => {
    renderDeleteRowDialog();
    expect(screen.getByTestId("collection-delete-row-dialog")).toBeInTheDocument();
  });

  it("does not render content when row is null", () => {
    renderDeleteRowDialog({ row: null });
    expect(screen.queryByTestId("collection-delete-row-dialog")).not.toBeInTheDocument();
  });

  it("shows the row id in the description", () => {
    renderDeleteRowDialog();
    expect(screen.getByTestId("collection-delete-row-dialog")).toHaveTextContent("row-123");
  });

  it("calls onConfirm when delete is clicked", () => {
    let confirmed = false;
    renderDeleteRowDialog({
      onConfirm: () => {
        confirmed = true;
      },
    });
    fireEvent.click(screen.getByTestId("collection-delete-row-confirm"));
    expect(confirmed).toBe(true);
  });

  it("disables the delete button when isPending", () => {
    renderDeleteRowDialog({ isPending: true });
    expect(screen.getByTestId("collection-delete-row-confirm")).toBeDisabled();
  });

  it("shows 'Deleting…' text while pending", () => {
    renderDeleteRowDialog({ isPending: true });
    expect(screen.getByTestId("collection-delete-row-confirm")).toHaveTextContent("Deleting…");
  });

  it("shows 'Delete' text when not pending", () => {
    renderDeleteRowDialog({ isPending: false });
    expect(screen.getByTestId("collection-delete-row-confirm")).toHaveTextContent("Delete");
  });
});
