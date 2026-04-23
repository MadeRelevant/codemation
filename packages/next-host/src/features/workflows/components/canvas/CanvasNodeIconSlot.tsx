import type { ReactNode } from "react";

export type CanvasIconRotate = 0 | 90 | 180 | 270;

/**
 * Fixed square slot so Lucide, Simple Icons, brand SVGs, and raster URLs share one bounding box.
 *
 * `rotate` applies an integer-degree CSS rotation to the inner glyph so node icons
 * can declare a canonical flow orientation (LTR workflow reading direction) without
 * needing a bespoke SVG for every 90° variant. See {@link WorkflowCanvasNodeIcon}
 * for the `@rot=N` suffix parsing.
 */
export function CanvasNodeIconSlot(
  props: Readonly<{ sizePx: number; children: ReactNode; rotate?: CanvasIconRotate }>,
) {
  const { sizePx, children, rotate } = props;
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
      {rotate ? (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            transform: `rotate(${rotate}deg)`,
            transformOrigin: "center center",
          }}
        >
          {children}
        </span>
      ) : (
        children
      )}
    </span>
  );
}
