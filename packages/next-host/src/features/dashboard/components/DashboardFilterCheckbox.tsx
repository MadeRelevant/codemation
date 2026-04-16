"use client";

import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function DashboardFilterCheckbox(
  props: Readonly<{
    label: string;
    checked: boolean;
    onToggle: () => void;
    testId: string;
  }>,
) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      role="checkbox"
      aria-checked={props.checked}
      onClick={props.onToggle}
      className={cn(
        "justify-start gap-2 rounded-full px-3.5 text-left shadow-none transition-all",
        props.checked
          ? "border-primary/40 bg-primary/10 text-foreground ring-1 ring-primary/20"
          : "border-border/70 bg-background/80 text-foreground hover:bg-muted/60",
      )}
      data-testid={props.testId}
    >
      <span
        className={cn(
          "flex size-4 items-center justify-center rounded-full border transition-colors",
          props.checked
            ? "border-primary bg-primary text-primary-foreground"
            : "border-muted-foreground/30 bg-background text-transparent",
        )}
      >
        {props.checked ? <Check className="size-3" /> : null}
      </span>
      <span className="font-medium">{props.label}</span>
    </Button>
  );
}
