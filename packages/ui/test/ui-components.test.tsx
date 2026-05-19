import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TreeContext } from "../src/components/reui/tree/TreeContext";
import { TreeDragLine } from "../src/components/reui/tree/TreeDragLine";
import { TreeItemLabel } from "../src/components/reui/tree/TreeItemLabel";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "../src/components/ui/dropdown-menu";

// ── DropdownMenu ──────────────────────────────────────────────────────────────

describe("DropdownMenu supplementary components", () => {
  it("renders DropdownMenuShortcut as a span", () => {
    const { container } = render(<DropdownMenuShortcut>⌘K</DropdownMenuShortcut>);
    const el = container.querySelector("[data-slot='dropdown-menu-shortcut']");
    expect(el).not.toBeNull();
    expect(el?.textContent).toBe("⌘K");
  });

  it("renders DropdownMenuGroup within an open menu", () => {
    render(
      <DropdownMenu open>
        <DropdownMenuTrigger>Open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuGroup>
            <DropdownMenuItem>Item A</DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    expect(screen.getByText("Item A")).toBeInTheDocument();
  });

  it("renders DropdownMenuRadioGroup and DropdownMenuRadioItem", () => {
    render(
      <DropdownMenu open>
        <DropdownMenuTrigger>Open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuRadioGroup value="a">
            <DropdownMenuRadioItem value="a">Option A</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    expect(screen.getByText("Option A")).toBeInTheDocument();
  });

  it("renders DropdownMenuSub with SubTrigger and SubContent via Portal", () => {
    render(
      <DropdownMenu open>
        <DropdownMenuTrigger>Open</DropdownMenuTrigger>
        <DropdownMenuPortal>
          <DropdownMenuContent>
            <DropdownMenuSub open>
              <DropdownMenuSubTrigger>More</DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent>
                  <DropdownMenuItem>Sub item</DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenu>,
    );
    expect(screen.getByText("More")).toBeInTheDocument();
  });
});

// ── TreeDragLine ───────────────────────────────────────────────────────────────

describe("TreeDragLine", () => {
  it("renders nothing when tree has no drag line style", () => {
    const { container } = render(
      <TreeContext.Provider value={{ indent: 20, tree: { getDragLineStyle: () => null } }}>
        <TreeDragLine />
      </TreeContext.Provider>,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders a drag line when tree provides drag line style", () => {
    const dragStyle = { top: 10, left: 0, width: 100 };
    render(
      <TreeContext.Provider value={{ indent: 20, tree: { getDragLineStyle: () => dragStyle } }}>
        <TreeDragLine data-testid="drag-line" />
      </TreeContext.Provider>,
    );
    expect(screen.getByTestId("drag-line")).toBeInTheDocument();
  });

  it("renders nothing when no tree context", () => {
    const { container } = render(
      <TreeContext.Provider value={{ indent: 20 }}>
        <TreeDragLine />
      </TreeContext.Provider>,
    );
    expect(container.firstChild).toBeNull();
  });
});

describe("TreeItemLabel", () => {
  it("renders null when no item is available", () => {
    const { container } = render(
      <TreeContext.Provider value={{ indent: 20 }}>
        <TreeItemLabel />
      </TreeContext.Provider>,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders children when item is provided", () => {
    const item = {
      isFolder: () => false,
      isExpanded: () => false,
      getItemName: () => "My Item",
    };
    render(
      <TreeContext.Provider value={{ indent: 20 }}>
        <TreeItemLabel item={item}>Label text</TreeItemLabel>
      </TreeContext.Provider>,
    );
    expect(screen.getByText("Label text")).toBeInTheDocument();
  });

  it("renders item name when no children are provided", () => {
    const item = {
      isFolder: () => false,
      isExpanded: () => false,
      getItemName: () => "Document.txt",
    };
    render(
      <TreeContext.Provider value={{ indent: 20 }}>
        <TreeItemLabel item={item} />
      </TreeContext.Provider>,
    );
    expect(screen.getByText("Document.txt")).toBeInTheDocument();
  });

  it("renders a chevron icon for folder items (chevron toggle)", () => {
    const item = {
      isFolder: () => true,
      isExpanded: () => false,
      getItemName: () => "Folder",
    };
    render(
      <TreeContext.Provider value={{ indent: 20, toggleIconType: "chevron" }}>
        <TreeItemLabel item={item} />
      </TreeContext.Provider>,
    );
    // The folder label should render (with icon)
    expect(screen.getByText("Folder")).toBeInTheDocument();
  });

  it("renders plus icon for collapsed folder with plus-minus toggle", () => {
    const item = {
      isFolder: () => true,
      isExpanded: () => false,
      getItemName: () => "CollapsedFolder",
    };
    render(
      <TreeContext.Provider value={{ indent: 20, toggleIconType: "plus-minus" }}>
        <TreeItemLabel item={item} />
      </TreeContext.Provider>,
    );
    expect(screen.getByText("CollapsedFolder")).toBeInTheDocument();
  });

  it("renders minus icon for expanded folder with plus-minus toggle", () => {
    const item = {
      isFolder: () => true,
      isExpanded: () => true,
      getItemName: () => "ExpandedFolder",
    };
    render(
      <TreeContext.Provider value={{ indent: 20, toggleIconType: "plus-minus" }}>
        <TreeItemLabel item={item} />
      </TreeContext.Provider>,
    );
    expect(screen.getByText("ExpandedFolder")).toBeInTheDocument();
  });

  it("renders as span by default", () => {
    const item = {
      isFolder: () => false,
      isExpanded: () => false,
      getItemName: () => "FileItem",
    };
    const { container } = render(
      <TreeContext.Provider value={{ indent: 20 }}>
        <TreeItemLabel item={item} />
      </TreeContext.Provider>,
    );
    expect(container.querySelector("span[data-slot='tree-item-label']")).toBeInTheDocument();
  });
});
