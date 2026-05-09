import type { CSSProperties } from "react";

/**
 * Renders a lucide glyph that's NOT in the curated registry by pointing CSS `mask-image`
 * at the server-side `/api/lucide-icon/<name>.svg` route.
 *
 * Why this shape, not a JS-side SVG fetch + dangerouslySetInnerHTML, and not a dynamic
 * `import("lucide-react/dist/esm/icons/" + name)`:
 *
 * - Any client-side `import()` with a template prefix triggers Webpack/Turbopack to
 *   bundle every file under the prefix (1,713 icons / 1.8 MB / OOM during dev compile).
 *   See `WorkflowCanvasLucideIconRegistry` doc and commit ddaa265f.
 * - Mask-image keeps the SVG out of the JS bundle entirely — the browser fetches the
 *   raw asset, caches it forever (route emits `Cache-Control: immutable`), and applies
 *   the current text colour via `background-color: currentColor`.
 *
 * The curated registry stays the fast path for icons used by core node plugins (zero
 * HTTP, zero flicker). Consumer-supplied lucide names take this slower path, with one
 * one-time HTTP fetch per unique icon per browser.
 */
export function WorkflowCanvasLucideRemoteGlyph(props: Readonly<{ name: string; sizePx: number }>) {
  const { name, sizePx } = props;
  const url = `/api/lucide-icon/${encodeURIComponent(name)}.svg`;
  const style: CSSProperties = {
    display: "inline-block",
    width: sizePx,
    height: sizePx,
    backgroundColor: "currentColor",
    WebkitMaskImage: `url(${url})`,
    maskImage: `url(${url})`,
    WebkitMaskSize: "contain",
    maskSize: "contain",
    WebkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
    WebkitMaskPosition: "center",
    maskPosition: "center",
  };
  return <span aria-hidden="true" data-testid="lucide-remote-glyph" data-icon-name={name} style={style} />;
}
