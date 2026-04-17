"use client";

import { useContext, type HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

import { TreeContext } from "./TreeContext";

export function TreeDragLine(args: Readonly<HTMLAttributes<HTMLDivElement>>) {
  const { className, ...props } = args;
  const { tree } = useContext(TreeContext);
  const dragLine = tree?.getDragLineStyle?.();

  if (!dragLine) {
    return null;
  }

  return (
    <div
      style={dragLine}
      className={cn(
        "bg-primary before:bg-background before:border-primary absolute z-30 -mt-px h-0.5 w-[unset] before:absolute before:-top-[3px] before:left-0 before:size-2 before:border-2 before:rounded-full",
        className,
      )}
      {...props}
    />
  );
}
