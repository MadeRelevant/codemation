import type { ReactNode } from "react";

/**
 * Fixed square slot so Lucide, Simple Icons, brand SVGs, and raster URLs share one bounding box.
 */
export function CanvasNodeIconSlot(props: Readonly<{ sizePx: number; children: ReactNode }>) {
  const { sizePx, children } = props;
  return (
    <span
      style={{
        width: sizePx,
        height: sizePx,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        lineHeight: 0,
        color: "#0f172a",
        backgroundColor: "transparent",
      }}
    >
      {children}
    </span>
  );
}
