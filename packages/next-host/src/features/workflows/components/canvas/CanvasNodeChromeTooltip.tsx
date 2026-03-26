"use client";

import { type ReactNode, useCallback, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Floating tooltip for canvas chrome (portal to `document.body` so parent `overflow:hidden` does not clip).
 * Positioned below the anchor so header-row icons (e.g. next to Active) are not clipped by the viewport top edge.
 */
export function CanvasNodeChromeTooltip(
  args: Readonly<{
    testId: string;
    ariaLabel: string;
    tooltip: string;
    children: ReactNode;
  }>,
): React.JSX.Element {
  const { ariaLabel, children, testId, tooltip } = args;
  const anchorRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [bubble, setBubble] = useState<Readonly<{ x: number; y: number }> | null>(null);

  const updatePosition = useCallback(() => {
    const el = anchorRef.current;
    if (!el) {
      return;
    }
    const r = el.getBoundingClientRect();
    setBubble({ x: r.left + r.width / 2, y: r.bottom });
  }, []);

  useLayoutEffect(() => {
    if (visible) {
      updatePosition();
    }
  }, [visible, updatePosition]);

  useLayoutEffect(() => {
    if (!visible) {
      return;
    }
    const onScroll = (): void => {
      updatePosition();
    };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [visible, updatePosition]);

  const tooltipBubble =
    visible && bubble && typeof document !== "undefined" ? (
      <div
        role="tooltip"
        className="pointer-events-none fixed z-[10000] max-w-[min(22rem,calc(100vw-2rem))] px-2 py-1.5 text-left text-[11px] font-bold leading-snug whitespace-pre-wrap text-white shadow-lg"
        style={{
          left: bubble.x,
          top: bubble.y,
          transform: "translate(-50%, 8px)",
          background: "rgba(15,23,42,0.94)",
          boxShadow: "0 10px 24px rgba(15,23,42,0.2)",
        }}
      >
        {tooltip}
      </div>
    ) : null;

  return (
    <div
      ref={anchorRef}
      data-testid={testId}
      className="relative inline-flex"
      onPointerEnter={() => {
        updatePosition();
        setVisible(true);
      }}
      onPointerLeave={() => setVisible(false)}
      onFocusCapture={() => {
        updatePosition();
        setVisible(true);
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setVisible(false);
        }
      }}
    >
      <span aria-label={ariaLabel} className="inline-flex">
        {children}
      </span>
      {tooltipBubble ? createPortal(tooltipBubble, document.body) : null}
    </div>
  );
}
