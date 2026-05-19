/**
 * Smoke tests for shadcn/Radix primitive wrappers in @codemation/ui.
 *
 * Strategy: every component is rendered at least once; branches (variant props,
 * showCloseButton, asChild, etc.) are exercised where they produce different
 * DOM output. No behavioural interaction tests — those belong in the packages
 * that consume these primitives in context.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Badge } from "../src/components/ui/badge";
import { Button } from "../src/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../src/components/ui/collapsible";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from "../src/components/ui/dialog";
import { Input } from "../src/components/ui/input";
import { Label } from "../src/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "../src/components/ui/select";
import { Switch } from "../src/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../src/components/ui/tabs";
import { Textarea } from "../src/components/ui/textarea";
import { CodemationDialog } from "../src/components/composite/CodemationDialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../src/components/ui/dropdown-menu";
import { Tree } from "../src/components/reui/tree/Tree";
import { TreeContext } from "../src/components/reui/tree/TreeContext";
import { TreeItem } from "../src/components/reui/tree/TreeItem";

// ── Badge ─────────────────────────────────────────────────────────────────────

describe("Badge", () => {
  it("renders with default variant", () => {
    const { container } = render(<Badge>Hello</Badge>);
    const el = container.querySelector("[data-slot='badge']");
    expect(el).not.toBeNull();
    expect(el?.textContent).toBe("Hello");
  });

  it("renders each named variant without crashing", () => {
    const variants = ["default", "secondary", "destructive", "outline", "ghost", "link"] as const;
    for (const variant of variants) {
      const { container } = render(<Badge variant={variant}>v</Badge>);
      expect(container.querySelector("[data-slot='badge']")).not.toBeNull();
    }
  });

  it("renders as child slot when asChild=true", () => {
    const { container } = render(
      <Badge asChild>
        <a href="#">link</a>
      </Badge>,
    );
    // Slot.Root merges props onto the child <a>
    expect(container.querySelector("a")).not.toBeNull();
  });

  it("merges custom className", () => {
    const { container } = render(<Badge className="custom-class">X</Badge>);
    expect(container.querySelector("[data-slot='badge']")?.className).toContain("custom-class");
  });
});

// ── Button ────────────────────────────────────────────────────────────────────

describe("Button", () => {
  it("renders as a button element", () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole("button", { name: "Click me" })).toBeInTheDocument();
  });

  it("renders each variant without crashing", () => {
    const variants = ["default", "outline", "secondary", "ghost", "destructive", "link"] as const;
    for (const variant of variants) {
      render(<Button variant={variant}>v</Button>);
    }
    // All buttons rendered in the same DOM but we just confirm no throw
    expect(screen.getAllByRole("button").length).toBeGreaterThanOrEqual(variants.length);
  });

  it("renders each size without crashing", () => {
    const sizes = ["default", "xs", "sm", "lg", "icon", "icon-xs", "icon-sm", "icon-lg"] as const;
    const { container } = render(
      <>
        {sizes.map((s) => (
          <Button key={s} size={s}>
            {s}
          </Button>
        ))}
      </>,
    );
    expect(container.querySelectorAll("[data-slot='button']").length).toBe(sizes.length);
  });

  it("renders as child slot when asChild=true", () => {
    const { container } = render(
      <Button asChild>
        <a href="#">link</a>
      </Button>,
    );
    expect(container.querySelector("a")).not.toBeNull();
  });

  it("applies data-variant and data-size attributes", () => {
    const { container } = render(
      <Button variant="ghost" size="sm">
        b
      </Button>,
    );
    const el = container.querySelector("[data-slot='button']");
    expect(el?.getAttribute("data-variant")).toBe("ghost");
    expect(el?.getAttribute("data-size")).toBe("sm");
  });
});

// ── Input ─────────────────────────────────────────────────────────────────────

describe("Input", () => {
  it("renders an input element with data-slot", () => {
    const { container } = render(<Input />);
    expect(container.querySelector("[data-slot='input']")).not.toBeNull();
  });

  it("passes type prop through", () => {
    const { container } = render(<Input type="email" />);
    expect(container.querySelector("input")?.type).toBe("email");
  });

  it("passes placeholder through", () => {
    render(<Input placeholder="Enter text" />);
    expect(screen.getByPlaceholderText("Enter text")).toBeInTheDocument();
  });
});

// ── Label ─────────────────────────────────────────────────────────────────────

describe("Label", () => {
  it("renders with data-slot", () => {
    const { container } = render(<Label>My label</Label>);
    const el = container.querySelector("[data-slot='label']");
    expect(el).not.toBeNull();
    expect(el?.textContent).toBe("My label");
  });

  it("merges custom className", () => {
    const { container } = render(<Label className="custom">Text</Label>);
    expect(container.querySelector("[data-slot='label']")?.className).toContain("custom");
  });
});

// ── Switch ────────────────────────────────────────────────────────────────────

describe("Switch", () => {
  it("renders with data-slot='switch'", () => {
    const { container } = render(<Switch />);
    expect(container.querySelector("[data-slot='switch']")).not.toBeNull();
  });

  it("renders the inner thumb", () => {
    const { container } = render(<Switch />);
    expect(container.querySelector("[data-slot='switch-thumb']")).not.toBeNull();
  });

  it("merges custom className", () => {
    const { container } = render(<Switch className="my-switch" />);
    expect(container.querySelector("[data-slot='switch']")?.className).toContain("my-switch");
  });
});

// ── Textarea ──────────────────────────────────────────────────────────────────

describe("Textarea", () => {
  it("renders a textarea with data-slot", () => {
    const { container } = render(<Textarea />);
    expect(container.querySelector("[data-slot='textarea']")).not.toBeNull();
  });

  it("passes placeholder through", () => {
    render(<Textarea placeholder="Write here" />);
    expect(screen.getByPlaceholderText("Write here")).toBeInTheDocument();
  });
});

// ── Collapsible ───────────────────────────────────────────────────────────────

describe("Collapsible", () => {
  it("renders root with data-slot='collapsible'", () => {
    const { container } = render(
      <Collapsible>
        <CollapsibleTrigger>Toggle</CollapsibleTrigger>
        <CollapsibleContent>Content</CollapsibleContent>
      </Collapsible>,
    );
    expect(container.querySelector("[data-slot='collapsible']")).not.toBeNull();
    expect(container.querySelector("[data-slot='collapsible-trigger']")).not.toBeNull();
    expect(container.querySelector("[data-slot='collapsible-content']")).not.toBeNull();
  });

  it("renders content when defaultOpen=true", () => {
    render(
      <Collapsible defaultOpen>
        <CollapsibleContent>Visible content</CollapsibleContent>
      </Collapsible>,
    );
    expect(screen.getByText("Visible content")).toBeInTheDocument();
  });
});

// ── Tabs ──────────────────────────────────────────────────────────────────────

describe("Tabs", () => {
  it("renders with data-slot='tabs'", () => {
    const { container } = render(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">Tab A</TabsTrigger>
        </TabsList>
        <TabsContent value="a">Panel A</TabsContent>
      </Tabs>,
    );
    expect(container.querySelector("[data-slot='tabs']")).not.toBeNull();
    expect(container.querySelector("[data-slot='tabs-list']")).not.toBeNull();
    expect(container.querySelector("[data-slot='tabs-trigger']")).not.toBeNull();
    expect(container.querySelector("[data-slot='tabs-content']")).not.toBeNull();
  });

  it("renders active tab content", () => {
    render(
      <Tabs defaultValue="b">
        <TabsList>
          <TabsTrigger value="a">A</TabsTrigger>
          <TabsTrigger value="b">B</TabsTrigger>
        </TabsList>
        <TabsContent value="a">Panel A</TabsContent>
        <TabsContent value="b">Panel B</TabsContent>
      </Tabs>,
    );
    expect(screen.getByText("Panel B")).toBeInTheDocument();
  });

  it("renders vertical orientation", () => {
    const { container } = render(
      <Tabs defaultValue="x" orientation="vertical">
        <TabsList>
          <TabsTrigger value="x">X</TabsTrigger>
        </TabsList>
        <TabsContent value="x">X content</TabsContent>
      </Tabs>,
    );
    expect(container.querySelector("[data-orientation='vertical']")).not.toBeNull();
  });

  it("renders TabsList with line variant", () => {
    const { container } = render(
      <Tabs defaultValue="x">
        <TabsList variant="line">
          <TabsTrigger value="x">X</TabsTrigger>
        </TabsList>
        <TabsContent value="x">X</TabsContent>
      </Tabs>,
    );
    expect(container.querySelector("[data-variant='line']")).not.toBeNull();
  });
});

// ── Select ────────────────────────────────────────────────────────────────────
// Note: Radix Select calls scrollIntoView() on mount when open, which jsdom doesn't
// implement. We stub it on Element.prototype before each open-select test.

describe("Select", () => {
  it("renders trigger with data-slot", () => {
    const { container } = render(
      <Select>
        <SelectTrigger>
          <SelectValue placeholder="Pick one" />
        </SelectTrigger>
      </Select>,
    );
    expect(container.querySelector("[data-slot='select-trigger']")).not.toBeNull();
  });

  it("renders small size trigger", () => {
    const { container } = render(
      <Select>
        <SelectTrigger size="sm">
          <SelectValue />
        </SelectTrigger>
      </Select>,
    );
    const trigger = container.querySelector("[data-slot='select-trigger']");
    expect(trigger?.getAttribute("data-size")).toBe("sm");
  });

  it("renders open select with group, label, item, separator", () => {
    // Radix Select calls scrollIntoView on mount — stub it for jsdom.
    const origScrollIntoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = () => {};
    try {
      render(
        <Select open>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>Colors</SelectLabel>
              <SelectItem value="red">Red</SelectItem>
              <SelectSeparator />
              <SelectItem value="blue">Blue</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>,
      );
      expect(screen.getByText("Red")).toBeInTheDocument();
      expect(screen.getByText("Blue")).toBeInTheDocument();
      expect(screen.getByText("Colors")).toBeInTheDocument();
    } finally {
      Element.prototype.scrollIntoView = origScrollIntoView;
    }
  });

  it("renders popper position content without crashing", () => {
    const origScrollIntoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = () => {};
    try {
      render(
        <Select open>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectItem value="x">X</SelectItem>
          </SelectContent>
        </Select>,
      );
      expect(screen.getByText("X")).toBeInTheDocument();
    } finally {
      Element.prototype.scrollIntoView = origScrollIntoView;
    }
  });
});

// ── Dialog ────────────────────────────────────────────────────────────────────

describe("Dialog", () => {
  it("renders open dialog with all sub-components", () => {
    render(
      <Dialog open>
        <DialogTrigger>Open</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>My title</DialogTitle>
            <DialogDescription>My description</DialogDescription>
          </DialogHeader>
          <p>Body content</p>
          <DialogFooter>
            <button type="button">Cancel</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.getByText("My title")).toBeInTheDocument();
    expect(screen.getByText("My description")).toBeInTheDocument();
    expect(screen.getByText("Body content")).toBeInTheDocument();
  });

  it("renders DialogContent without close button when showCloseButton=false", () => {
    const { container } = render(
      <Dialog open>
        <DialogContent showCloseButton={false}>
          <DialogTitle>No X</DialogTitle>
        </DialogContent>
      </Dialog>,
    );
    // The ghost close button should not be present
    const closeButtons = container.querySelectorAll("[data-slot='dialog-close']");
    expect(closeButtons.length).toBe(0);
  });

  it("renders DialogFooter with showCloseButton=true", () => {
    render(
      <Dialog open>
        <DialogContent showCloseButton={false}>
          <DialogTitle>Footer close</DialogTitle>
          <DialogFooter showCloseButton>
            <span>Actions</span>
          </DialogFooter>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });

  it("renders DialogOverlay standalone", () => {
    render(
      <Dialog open>
        <DialogPortal>
          <DialogOverlay />
        </DialogPortal>
      </Dialog>,
    );
    // The overlay should render in the DOM
    const overlay = document.querySelector("[data-slot='dialog-overlay']");
    expect(overlay).not.toBeNull();
  });
});

// ── CodemationDialog ──────────────────────────────────────────────────────────

describe("CodemationDialog", () => {
  it("renders compound dialog with title, content and actions (bottom)", () => {
    render(
      <CodemationDialog onClose={() => {}}>
        <CodemationDialog.Title>Title text</CodemationDialog.Title>
        <CodemationDialog.Content>Body text</CodemationDialog.Content>
        <CodemationDialog.Actions>
          <button type="button">OK</button>
        </CodemationDialog.Actions>
      </CodemationDialog>,
    );
    expect(screen.getByText("Title text")).toBeInTheDocument();
    expect(screen.getByText("Body text")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "OK" })).toBeInTheDocument();
  });

  it("renders actions at top position", () => {
    render(
      <CodemationDialog onClose={() => {}}>
        <CodemationDialog.Title>T</CodemationDialog.Title>
        <CodemationDialog.Content>C</CodemationDialog.Content>
        <CodemationDialog.Actions position="top" align="start">
          <button type="button">Filter</button>
        </CodemationDialog.Actions>
      </CodemationDialog>,
    );
    expect(screen.getByRole("button", { name: "Filter" })).toBeInTheDocument();
  });

  it("renders actions with align=between", () => {
    render(
      <CodemationDialog onClose={() => {}}>
        <CodemationDialog.Title>T</CodemationDialog.Title>
        <CodemationDialog.Content>C</CodemationDialog.Content>
        <CodemationDialog.Actions align="between">
          <button type="button">L</button>
          <button type="button">R</button>
        </CodemationDialog.Actions>
      </CodemationDialog>,
    );
    expect(screen.getByRole("button", { name: "L" })).toBeInTheDocument();
  });

  it("renders narrow and full size variants without crashing", () => {
    const { unmount } = render(
      <CodemationDialog onClose={() => {}} size="narrow">
        <CodemationDialog.Title>Narrow</CodemationDialog.Title>
        <CodemationDialog.Content>C</CodemationDialog.Content>
      </CodemationDialog>,
    );
    expect(screen.getByText("Narrow")).toBeInTheDocument();
    unmount();

    render(
      <CodemationDialog onClose={() => {}} size="full">
        <CodemationDialog.Title>Full</CodemationDialog.Title>
        <CodemationDialog.Content>C</CodemationDialog.Content>
      </CodemationDialog>,
    );
    expect(screen.getByText("Full")).toBeInTheDocument();
  });

  it("renders with showCloseButton=true", () => {
    render(
      <CodemationDialog onClose={() => {}} showCloseButton>
        <CodemationDialog.Title>Closeable</CodemationDialog.Title>
        <CodemationDialog.Content>C</CodemationDialog.Content>
      </CodemationDialog>,
    );
    expect(screen.getByText("Closeable")).toBeInTheDocument();
  });

  it("renders with alertdialog role", () => {
    render(
      <CodemationDialog onClose={() => {}} role="alertdialog" testId="my-alert">
        <CodemationDialog.Title>Alert</CodemationDialog.Title>
        <CodemationDialog.Content>C</CodemationDialog.Content>
      </CodemationDialog>,
    );
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });

  it("passes contentClassName to the panel", () => {
    render(
      <CodemationDialog onClose={() => {}} contentClassName="extra-class">
        <CodemationDialog.Title>T</CodemationDialog.Title>
        <CodemationDialog.Content>C</CodemationDialog.Content>
      </CodemationDialog>,
    );
    const panel = document.querySelector("[data-slot='dialog-content']");
    expect(panel?.className).toContain("extra-class");
  });
});

// ── Tree ──────────────────────────────────────────────────────────────────────

describe("Tree", () => {
  it("renders with data-slot='tree'", () => {
    const { container } = render(<Tree>content</Tree>);
    expect(container.querySelector("[data-slot='tree']")).not.toBeNull();
  });

  it("applies custom indent via CSS variable", () => {
    const { container } = render(<Tree indent={30}>content</Tree>);
    const el = container.querySelector("[data-slot='tree']") as HTMLElement | null;
    expect(el?.style.getPropertyValue("--tree-indent")).toBe("30px");
  });

  it("renders with asChild=true (Slot)", () => {
    const { container } = render(
      <Tree asChild>
        <ul>
          <li>item</li>
        </ul>
      </Tree>,
    );
    // The outer element should be the <ul> with data-slot
    expect(container.querySelector("ul[data-slot='tree']")).not.toBeNull();
  });

  it("calls getContainerProps on the tree object", () => {
    const tree = {
      getContainerProps: () => ({ "data-custom": "yes" }),
    };
    const { container } = render(<Tree tree={tree}>x</Tree>);
    const el = container.querySelector("[data-slot='tree']");
    expect(el?.getAttribute("data-custom")).toBe("yes");
  });

  it("exposes plus-minus toggleIconType to context", () => {
    // TreeItemLabel inside a plus-minus tree will render a plus icon for collapsed folder
    render(
      <Tree toggleIconType="plus-minus">
        <TreeContext.Consumer>
          {(ctx) => <span data-testid="icon-type">{ctx.toggleIconType}</span>}
        </TreeContext.Consumer>
      </Tree>,
    );
    expect(screen.getByTestId("icon-type").textContent).toBe("plus-minus");
  });
});

// ── TreeItem ──────────────────────────────────────────────────────────────────

describe("TreeItem", () => {
  type ItemOverrides = Partial<{
    getProps: () => Record<string, unknown>;
    getItemMeta: () => { level: number };
    isFocused: () => boolean;
    isFolder: () => boolean;
    isExpanded: () => boolean;
    isSelected: () => boolean;
    isDragTarget: () => boolean;
    isMatchingSearch: () => boolean;
  }>;

  function makeItem(overrides: ItemOverrides = {}) {
    return {
      getProps: () => ({}),
      getItemMeta: () => ({ level: 0 }),
      isFocused: () => false,
      isFolder: () => false,
      isExpanded: () => false,
      isSelected: () => false,
      isDragTarget: () => false,
      isMatchingSearch: () => false,
      ...overrides,
    };
  }

  it("renders as a button by default", () => {
    const item = makeItem();
    render(<TreeItem item={item}>file.txt</TreeItem>);
    expect(screen.getByRole("button", { name: "file.txt" })).toBeInTheDocument();
  });

  it("renders as child slot when asChild=true", () => {
    const item = makeItem();
    const { container } = render(
      <TreeItem item={item} asChild>
        <div>file</div>
      </TreeItem>,
    );
    expect(container.querySelector("div[data-slot='tree-item']")).not.toBeNull();
  });

  it("sets data-folder=true for folder items", () => {
    const item = makeItem({ isFolder: () => true });
    const { container } = render(<TreeItem item={item}>folder</TreeItem>);
    expect(container.querySelector("[data-folder='true']")).not.toBeNull();
  });

  it("sets data-focus=true when focused", () => {
    const item = makeItem({ isFocused: () => true });
    const { container } = render(<TreeItem item={item}>x</TreeItem>);
    expect(container.querySelector("[data-focus='true']")).not.toBeNull();
  });

  it("sets data-selected when isSelected is defined", () => {
    const item = makeItem({ isSelected: () => true });
    const { container } = render(<TreeItem item={item}>x</TreeItem>);
    expect(container.querySelector("[data-selected='true']")).not.toBeNull();
  });

  it("applies padding based on indent and level", () => {
    const item = makeItem({ getItemMeta: () => ({ level: 2 }) });
    const { container } = render(
      <TreeContext.Provider value={{ indent: 16 }}>
        <TreeItem item={item}>item</TreeItem>
      </TreeContext.Provider>,
    );
    const el = container.querySelector("[data-slot='tree-item']") as HTMLElement | null;
    // Level 2 * indent 16 = 32px
    expect(el?.style.getPropertyValue("--tree-padding")).toBe("32px");
  });
});

// ── Dialog: DialogClose ────────────────────────────────────────────────────────

describe("DialogClose", () => {
  it("renders DialogClose with data-slot", () => {
    render(
      <Dialog open>
        <DialogPortal>
          <DialogClose>Dismiss</DialogClose>
        </DialogPortal>
      </Dialog>,
    );
    const el = document.querySelector("[data-slot='dialog-close']");
    expect(el).not.toBeNull();
  });
});

// ── DropdownMenu: remaining components ────────────────────────────────────────

describe("DropdownMenu remaining components", () => {
  it("renders DropdownMenuCheckboxItem with checked state", () => {
    render(
      <DropdownMenu open>
        <DropdownMenuTrigger>Open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuCheckboxItem checked>Check me</DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    expect(screen.getByText("Check me")).toBeInTheDocument();
  });

  it("renders DropdownMenuLabel", () => {
    render(
      <DropdownMenu open>
        <DropdownMenuTrigger>Open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>Section heading</DropdownMenuLabel>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    expect(screen.getByText("Section heading")).toBeInTheDocument();
  });

  it("renders DropdownMenuSeparator", () => {
    render(
      <DropdownMenu open>
        <DropdownMenuTrigger>Open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuSeparator />
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    const sep = document.querySelector("[data-slot='dropdown-menu-separator']");
    expect(sep).not.toBeNull();
  });
});
