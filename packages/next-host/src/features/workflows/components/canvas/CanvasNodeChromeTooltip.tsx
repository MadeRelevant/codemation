"use client";

import { type ReactNode, useState } from "react";

/** Small floating tooltip (not the browser `title` tooltip) for compact canvas chrome. */
export function CanvasNodeChromeTooltip(
  args: Readonly<{
    testId: string;
    ariaLabel: string;
    tooltip: string;
    children: ReactNode;
  }>,
): React.JSX.Element {
  const { ariaLabel, children, testId, tooltip } = args;
  const [visible, setVisible] = useState(false);
  return (
    <div
      data-testid={testId}
      className="relative grid place-items-center"
      onPointerEnter={() => setVisible(true)}
      onPointerLeave={() => setVisible(false)}
      onFocusCapture={() => setVisible(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setVisible(false);
        }
      }}
    >
      <span aria-label={ariaLabel} className="inline-flex">
        {children}
      </span>
      <div
        role="tooltip"
        aria-hidden={!visible}
        className="pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 z-50 max-w-[min(22rem,calc(100vw-2rem))] -translate-x-1/2 px-2 py-1.5 text-left text-[11px] font-bold leading-snug whitespace-pre-wrap text-white shadow-lg transition-[opacity,transform] duration-100 ease-out"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? "translate(-50%, 0)" : "translate(-50%, 4px)",
          background: "rgba(15,23,42,0.94)",
          boxShadow: "0 10px 24px rgba(15,23,42,0.2)",
        }}
      >
        {tooltip}
      </div>
    </div>
  );
}
