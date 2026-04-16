"use client";

import { DashboardStatusPresentation } from "../lib/DashboardStatusPresentation";

export function DashboardRunStatusTooltip(
  props: Readonly<{
    active?: boolean;
    label?: string | number;
    payload?: ReadonlyArray<Readonly<{ value?: number | string; name?: string }>>;
  }>,
) {
  if (!props.active || !props.payload?.length) {
    return null;
  }
  return (
    <div className="rounded-md border bg-popover px-3 py-2 shadow-sm">
      <div className="mb-2 text-xs font-semibold text-muted-foreground">{String(props.label)}</div>
      <div className="space-y-1">
        {props.payload
          .filter((entry) => typeof entry.value === "number" && Number(entry.value) > 0)
          .map((entry) => (
            <div key={entry.name} className="flex items-center justify-between gap-4 text-sm">
              <div className="flex items-center gap-2">
                <span
                  className="size-2 rounded-full"
                  style={{
                    backgroundColor:
                      entry.name === "Completed"
                        ? DashboardStatusPresentation.completedColor
                        : entry.name === "Failed"
                          ? DashboardStatusPresentation.failedColor
                          : DashboardStatusPresentation.runningColor,
                  }}
                />
                <span>{entry.name}</span>
              </div>
              <span className="font-medium">{String(entry.value)}</span>
            </div>
          ))}
      </div>
    </div>
  );
}
