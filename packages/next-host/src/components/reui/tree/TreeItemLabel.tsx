"use client";

import { MinusIcon, PlusIcon, ChevronDownIcon } from "lucide-react";
import { Slot } from "radix-ui";
import { Fragment, useContext, type HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

import { TreeContext } from "./TreeContext";

type TreeItemLabelProps = HTMLAttributes<HTMLSpanElement> & {
  item?: {
    isFolder: () => boolean;
    isExpanded: () => boolean;
    getItemName: () => string;
  };
  asChild?: boolean;
};

export function TreeItemLabel(args: Readonly<TreeItemLabelProps>) {
  const { item: propItem, children, className, asChild = false, ...props } = args;
  const { currentItem, toggleIconType } = useContext(TreeContext);
  const item = propItem ?? currentItem;

  if (!item) {
    return null;
  }

  const Component = asChild ? Slot.Root : "span";

  return (
    <Component
      data-slot="tree-item-label"
      className={cn(
        "in-focus-visible:ring-ring/50 bg-background hover:bg-accent in-data-[selected=true]:bg-accent in-data-[selected=true]:text-accent-foreground in-data-[drag-target=true]:bg-accent flex items-center gap-1 transition-colors not-in-data-[folder=true]:ps-7 in-focus-visible:ring-[3px] in-data-[search-match=true]:bg-blue-50! [&_svg]:pointer-events-none [&_svg]:shrink-0",
        "rounded-sm py-1.5 px-2 text-sm",
        className,
      )}
      {...props}
    >
      <Fragment>
        {item.isFolder() &&
          (toggleIconType === "plus-minus" ? (
            item.isExpanded() ? (
              <MinusIcon className="text-muted-foreground size-3.5" stroke="currentColor" strokeWidth="1" />
            ) : (
              <PlusIcon className="text-muted-foreground size-3.5" stroke="currentColor" strokeWidth="1" />
            )
          ) : (
            <ChevronDownIcon className="text-muted-foreground size-4 in-aria-[expanded=false]:-rotate-90" />
          ))}
        {children ?? item.getItemName()}
      </Fragment>
    </Component>
  );
}
