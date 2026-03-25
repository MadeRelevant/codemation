import { Boxes } from "lucide-react";
import { DynamicIcon } from "lucide-react/dynamic";
import type { IconName } from "lucide-react/dynamic";
import { Suspense, type CSSProperties, type ReactNode } from "react";

import { CanvasNodeIconSlot } from "./CanvasNodeIconSlot";
import { WorkflowCanvasBuiltinIconRegistry } from "./lib/WorkflowCanvasBuiltinIconRegistry";
import { WorkflowCanvasSiIconRegistry } from "./lib/WorkflowCanvasSiIconRegistry";
import { WorkflowCanvasSimpleIconGlyph } from "./WorkflowCanvasSimpleIconGlyph";

/** Main node glyph: always contained in the slot, no opaque backing (card paints the tile). */
const IMG_STYLE: CSSProperties = {
  display: "block",
  width: "100%",
  height: "100%",
  maxWidth: "100%",
  maxHeight: "100%",
  objectFit: "contain",
  objectPosition: "center",
  backgroundColor: "transparent",
};

function isHttpOrDataUrl(value: string): boolean {
  const v = value.trim().toLowerCase();
  return v.startsWith("http://") || v.startsWith("https://") || v.startsWith("data:") || v.startsWith("/");
}

function builtinAssetImg(url: string, sizePx: number): ReactNode {
  return (
    <CanvasNodeIconSlot sizePx={sizePx}>
      <img src={url} alt="" style={{ ...IMG_STYLE, width: "100%", height: "100%" }} />
    </CanvasNodeIconSlot>
  );
}

/**
 * Canvas node icon resolution:
 * - **URLs** — `http(s):`, `data:`, or root-relative `/…`
 * - **`builtin:<id>`** — SVG under `public/canvas-icons/builtin/` (see {@link WorkflowCanvasBuiltinIconRegistry})
 * - **`si:<slug>`** — cherry-picked Simple Icons, or same builtin asset when slug matches a registered builtin (e.g. `si:openai`)
 * - **`lucide:<name>`** or legacy kebab name — Lucide dynamic icon
 *
 * Node configs set {@link import("@codemation/core").NodeConfigBase.icon}.
 */
export function WorkflowCanvasNodeIcon(props: Readonly<{ icon?: string; sizePx: number; strokeWidth?: number }>) {
  const { icon, sizePx, strokeWidth = 2 } = props;
  const raw = icon?.trim();
  if (!raw) {
    return (
      <CanvasNodeIconSlot sizePx={sizePx}>
        <Boxes size={sizePx} strokeWidth={strokeWidth} />
      </CanvasNodeIconSlot>
    );
  }
  if (isHttpOrDataUrl(raw)) {
    return (
      <CanvasNodeIconSlot sizePx={sizePx}>
        <img src={raw} alt="" style={{ ...IMG_STYLE, width: "100%", height: "100%" }} />
      </CanvasNodeIconSlot>
    );
  }
  if (raw.startsWith("builtin:")) {
    const id = raw.slice("builtin:".length).trim().toLowerCase();
    const url = WorkflowCanvasBuiltinIconRegistry.resolveUrl(id);
    if (url) {
      return builtinAssetImg(url, sizePx);
    }
    return (
      <CanvasNodeIconSlot sizePx={sizePx}>
        <Boxes size={sizePx} strokeWidth={strokeWidth} />
      </CanvasNodeIconSlot>
    );
  }
  if (raw.startsWith("si:")) {
    const slug = raw.slice("si:".length).trim().toLowerCase();
    const builtinUrl = WorkflowCanvasBuiltinIconRegistry.resolveUrl(slug);
    if (builtinUrl) {
      return builtinAssetImg(builtinUrl, sizePx);
    }
    const data = WorkflowCanvasSiIconRegistry.resolve(slug);
    if (data) {
      return (
        <CanvasNodeIconSlot sizePx={sizePx}>
          <WorkflowCanvasSimpleIconGlyph title={data.title} path={data.path} hex={data.hex} sizePx={sizePx} />
        </CanvasNodeIconSlot>
      );
    }
    return (
      <CanvasNodeIconSlot sizePx={sizePx}>
        <Boxes size={sizePx} strokeWidth={strokeWidth} />
      </CanvasNodeIconSlot>
    );
  }
  const lucideName = raw.startsWith("lucide:") ? raw.slice("lucide:".length).trim().toLowerCase() : raw.toLowerCase();
  return (
    <CanvasNodeIconSlot sizePx={sizePx}>
      <Suspense fallback={<Boxes size={sizePx} strokeWidth={strokeWidth} />}>
        <DynamicIcon name={lucideName as IconName} size={sizePx} strokeWidth={strokeWidth} />
      </Suspense>
    </CanvasNodeIconSlot>
  );
}
