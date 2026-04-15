"use client";

import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface DashboardMultiSelectOption {
  readonly value: string;
  readonly label: string;
}

export function DashboardMultiSelect(
  props: Readonly<{
    label: string;
    options: ReadonlyArray<DashboardMultiSelectOption>;
    selectedValues: ReadonlyArray<string>;
    onToggleValue: (value: string) => void;
    emptyLabel?: string;
    testId: string;
  }>,
) {
  const summary =
    props.selectedValues.length === 0
      ? "All"
      : props.selectedValues.length === 1
        ? "1 selected"
        : `${String(props.selectedValues.length)} selected`;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-w-[9rem] justify-between"
          data-testid={props.testId}
        >
          <span className="truncate">{`${props.label}: ${summary}`}</span>
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>{props.label}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {props.options.length === 0 ? (
          <div className="px-2 py-1.5 text-sm text-muted-foreground">{props.emptyLabel ?? "No options available"}</div>
        ) : (
          props.options.map((option) => (
            <DropdownMenuCheckboxItem
              key={option.value}
              checked={props.selectedValues.includes(option.value)}
              onCheckedChange={() => props.onToggleValue(option.value)}
              data-testid={`${props.testId}-${option.value}`}
            >
              {option.label}
            </DropdownMenuCheckboxItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
