"use client";

import ChevronRight from "lucide-react/dist/esm/icons/chevron-right";
import { useState } from "react";

const MAX_VALUE_DISPLAY_LENGTH = 120;

function formatJsonValue(value: unknown): string {
  if (value === undefined) return "—";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function truncateValue(
  value: unknown,
  maxLength: number,
): {
  full: string;
  truncated: string;
  shouldExpand: boolean;
} {
  const full = formatJsonValue(value);
  return {
    full,
    truncated: full.length > maxLength ? full.substring(0, maxLength) + "…" : full,
    shouldExpand: full.length > maxLength,
  };
}

export function ExpandableJsonValue(props: Readonly<{ value: unknown }>) {
  const [expanded, setExpanded] = useState(false);
  const { full, truncated, shouldExpand } = truncateValue(props.value, MAX_VALUE_DISPLAY_LENGTH);

  if (!shouldExpand) {
    return <pre className="overflow-x-auto rounded bg-muted/40 px-2 py-1 text-xs">{truncated}</pre>;
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className="inline-flex w-fit items-center gap-1 rounded px-1 py-0.5 text-xs text-muted-foreground hover:bg-muted/40 transition-colors"
        type="button"
      >
        <ChevronRight size={12} strokeWidth={2} className={`transition-transform ${expanded ? "rotate-90" : ""}`} />
        <span className="underline">{expanded ? "hide" : "show more"}</span>
      </button>
      <pre className="overflow-x-auto rounded bg-muted/40 px-2 py-1 text-xs">{expanded ? full : truncated}</pre>
    </div>
  );
}
