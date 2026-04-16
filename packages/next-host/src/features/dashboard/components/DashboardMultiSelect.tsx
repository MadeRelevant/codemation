"use client";

import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export interface DashboardMultiSelectOption {
  readonly kind?: "option";
  readonly value: string;
  readonly label: string;
  readonly depth?: number;
}

export interface DashboardMultiSelectHeading {
  readonly kind: "heading";
  readonly label: string;
  readonly depth?: number;
}

export function DashboardMultiSelect(
  props: Readonly<{
    label: string;
    options: ReadonlyArray<DashboardMultiSelectOption | DashboardMultiSelectHeading>;
    selectedValues: ReadonlyArray<string>;
    onToggleValue: (value: string) => void;
    onClearSelection?: () => void;
    emptyLabel?: string;
    testId: string;
    contentClassName?: string;
    defaultOpen?: boolean;
  }>,
) {
  const summary =
    props.selectedValues.length === 0
      ? "All"
      : props.selectedValues.length === 1
        ? "1 selected"
        : `${String(props.selectedValues.length)} selected`;
  return (
    <DropdownMenu defaultOpen={props.defaultOpen}>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="w-full justify-between" data-testid={props.testId}>
          <span className="truncate">{summary}</span>
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className={cn("w-64", props.contentClassName)}>
        <DropdownMenuLabel>{props.label}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {props.selectedValues.length > 0 ? (
          <>
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
                props.onClearSelection?.();
              }}
              className="font-medium text-muted-foreground"
              data-testid={`${props.testId}-clear`}
            >
              Clear selection
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        ) : null}
        {props.options.length === 0 ? (
          <div className="px-2 py-1.5 text-sm text-muted-foreground" data-testid={`${props.testId}-empty`}>
            {props.emptyLabel ?? "No options available"}
          </div>
        ) : (
          props.options.map((option, index) =>
            option.kind === "heading" ? (
              <div
                key={`${option.label}-${String(index)}`}
                className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                style={{ paddingLeft: `${0.5 + (option.depth ?? 0) * 0.9}rem` }}
                data-testid={`${props.testId}-heading-${String(index)}`}
              >
                {option.label}
              </div>
            ) : (
              <DropdownMenuCheckboxItem
                key={option.value}
                checked={props.selectedValues.includes(option.value)}
                onCheckedChange={() => props.onToggleValue(option.value)}
                style={{ paddingLeft: `${0.5 + ((option.depth ?? 0) + 1) * 0.9}rem` }}
                data-testid={`${props.testId}-${option.value}`}
              >
                {option.label}
              </DropdownMenuCheckboxItem>
            ),
          )
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
