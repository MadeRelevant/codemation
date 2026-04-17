"use client";

import { Slot } from "radix-ui";
import type { CSSProperties, HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

import { TreeContext, type ToggleIconType } from "./TreeContext";

type TreeProps = HTMLAttributes<HTMLDivElement> & {
  indent?: number;
  tree?: {
    getContainerProps?: () => Record<string, unknown>;
  };
  toggleIconType?: ToggleIconType;
  asChild?: boolean;
};

export function Tree(args: Readonly<TreeProps>) {
  const { indent = 20, tree, className, toggleIconType = "chevron", asChild = false, ...props } = args;
  const containerProps = tree?.getContainerProps?.() ?? {};
  const mergedProps = { ...props, ...containerProps };
  const { style: propStyle, ...otherProps } = mergedProps as HTMLAttributes<HTMLDivElement>;
  const mergedStyle = {
    ...propStyle,
    "--tree-indent": `${indent}px`,
  } as CSSProperties;
  const Component = asChild ? Slot.Root : "div";

  return (
    <TreeContext.Provider value={{ indent, tree, toggleIconType }}>
      <Component data-slot="tree" style={mergedStyle} className={cn("flex flex-col", className)} {...otherProps} />
    </TreeContext.Provider>
  );
}
