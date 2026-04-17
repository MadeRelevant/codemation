"use client";

import type { ItemInstance } from "@headless-tree/core";
import { Slot } from "radix-ui";
import { useContext, type ButtonHTMLAttributes, type CSSProperties } from "react";

import { cn } from "@/lib/utils";

import { TreeContext } from "./TreeContext";

type TreeItemProps<T = unknown> = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "indent"> & {
  item: ItemInstance<T>;
  indent?: number;
  asChild?: boolean;
};

export function TreeItem<T = unknown>(args: Readonly<TreeItemProps<T>>) {
  const { item, className, asChild = false, children, ...props } = args;
  const parentContext = useContext(TreeContext);
  const indent = parentContext.indent;
  const itemProps = item.getProps();
  const mergedProps = { ...props, children, ...itemProps };
  const { style: propStyle, ...otherProps } = mergedProps as ButtonHTMLAttributes<HTMLButtonElement>;
  const mergedStyle = {
    ...propStyle,
    "--tree-padding": `${item.getItemMeta().level * indent}px`,
  } as CSSProperties;
  const defaultProps = {
    "data-slot": "tree-item",
    style: mergedStyle,
    className: cn(
      "z-10 ps-(--tree-padding) outline-hidden select-none not-last:pb-0.5 focus:z-20 data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className,
    ),
    "data-focus": item.isFocused() || false,
    "data-folder": item.isFolder() || false,
    "data-selected": typeof item.isSelected === "function" ? item.isSelected() || false : undefined,
    "data-drag-target": typeof item.isDragTarget === "function" ? item.isDragTarget() || false : undefined,
    "data-search-match": typeof item.isMatchingSearch === "function" ? item.isMatchingSearch() || false : undefined,
    "aria-expanded": item.isExpanded(),
  };
  const Component = asChild ? Slot.Root : "button";

  return (
    <TreeContext.Provider value={{ ...parentContext, currentItem: item as ItemInstance<unknown> }}>
      <Component {...defaultProps} {...otherProps}>
        {children}
      </Component>
    </TreeContext.Provider>
  );
}
