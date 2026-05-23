"use client";
import type { CSSProperties } from "react";

/**
 * Renders a Simple Icon glyph via CSS `mask-image` pointing at `/api/si-icon/<slug>.svg`.
 *
 * This keeps the `simple-icons` ~5 MB barrel out of the client bundle entirely — the browser
 * fetches the raw SVG asset, caches it forever (route emits `Cache-Control: immutable`), and
 * applies the current text colour via `background-color: currentColor`.
 *
 * Note: brand colours are not applied (CSS mask renders in `currentColor`). This is acceptable
 * for canvas node icons where brand colouring would conflict with the node card's palette.
 */
export function WorkflowCanvasSiRemoteGlyph(props: Readonly<{ url: string; sizePx: number }>) {
  const { url, sizePx } = props;
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
  return <span aria-hidden="true" data-testid="si-remote-glyph" data-icon-url={url} style={style} />;
}
