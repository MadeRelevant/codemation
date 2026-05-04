// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { CollectionDetailDto, CollectionRowDto } from "@codemation/host/dto";
import { CollectionRowsTable } from "../../src/features/collections/components/CollectionRowsTable";
import { CollectionRowsPagination } from "../../src/features/collections/components/CollectionRowsPagination";

function makeDetail(overrides: Partial<CollectionDetailDto> = {}): CollectionDetailDto {
  return {
    name: "messages",
    fields: [
      { name: "sender_email", type: "text", nullable: false, hasDefault: false },
      { name: "body", type: "text", nullable: true, hasDefault: false },
    ],
    indexes: [],
    ...overrides,
  };
}

function makeRow(overrides: Partial<CollectionRowDto> = {}): CollectionRowDto {
  return {
    id: "row-1",
    created_at: "2024-01-01T00:00:00.000Z",
    updated_at: "2024-01-01T00:00:00.000Z",
    data: { sender_email: "test@example.com", body: "Hello" },
    ...overrides,
  };
}

describe("CollectionRowsTable", () => {
  it("shows empty state when no rows", () => {
    render(<CollectionRowsTable detail={makeDetail()} rows={[]} onEdit={() => {}} onDelete={() => {}} />);
    expect(screen.getByTestId("collection-rows-empty")).toBeTruthy();
  });

  it("renders rows with dynamic field columns", () => {
    const row = makeRow();
    render(<CollectionRowsTable detail={makeDetail()} rows={[row]} onEdit={() => {}} onDelete={() => {}} />);
    expect(screen.getByTestId("collection-rows-table")).toBeTruthy();
    expect(screen.getByTestId(`collection-row-${row.id}`)).toBeTruthy();
    expect(screen.getByTestId(`collection-row-field-${row.id}-sender_email`).textContent).toContain("test@example.com");
  });

  it("calls onEdit when edit button is clicked", () => {
    const row = makeRow();
    const editCalls: CollectionRowDto[] = [];
    render(
      <CollectionRowsTable detail={makeDetail()} rows={[row]} onEdit={(r) => editCalls.push(r)} onDelete={() => {}} />,
    );
    const editBtn = screen.getByTestId(`collection-row-edit-${row.id}`);
    fireEvent.click(editBtn);
    expect(editCalls).toHaveLength(1);
    expect(editCalls[0]?.id).toBe(row.id);
  });

  it("calls onDelete when delete button is clicked", () => {
    const row = makeRow();
    const deleteCalls: CollectionRowDto[] = [];
    render(
      <CollectionRowsTable
        detail={makeDetail()}
        rows={[row]}
        onEdit={() => {}}
        onDelete={(r) => deleteCalls.push(r)}
      />,
    );
    const deleteBtn = screen.getByTestId(`collection-row-delete-${row.id}`);
    fireEvent.click(deleteBtn);
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0]?.id).toBe(row.id);
  });
});

describe("CollectionRowsPagination", () => {
  it("renders page info", () => {
    render(<CollectionRowsPagination page={2} pageCount={5} onPageChange={() => {}} />);
    expect(screen.getByTestId("collection-rows-pagination-label").textContent).toBe("Page 2 of 5");
  });

  it("disables Previous on first page", () => {
    render(<CollectionRowsPagination page={1} pageCount={3} onPageChange={() => {}} />);
    expect((screen.getByTestId("collection-rows-pagination-prev") as HTMLButtonElement).disabled).toBe(true);
  });

  it("disables Next on last page", () => {
    render(<CollectionRowsPagination page={3} pageCount={3} onPageChange={() => {}} />);
    expect((screen.getByTestId("collection-rows-pagination-next") as HTMLButtonElement).disabled).toBe(true);
  });

  it("calls onPageChange with correct page", () => {
    const pages: number[] = [];
    render(<CollectionRowsPagination page={2} pageCount={5} onPageChange={(p) => pages.push(p)} />);
    fireEvent.click(screen.getByTestId("collection-rows-pagination-next"));
    expect(pages).toEqual([3]);
    fireEvent.click(screen.getByTestId("collection-rows-pagination-prev"));
    expect(pages).toEqual([3, 1]);
  });
});
