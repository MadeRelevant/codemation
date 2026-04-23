import { Boxes } from "lucide-react";
import { DynamicIcon } from "lucide-react/dynamic";
import type { IconName } from "lucide-react/dynamic";
import { Suspense, type CSSProperties, type ReactNode } from "react";

import { WorkflowNodeIconResolver } from "../workflowDetail/WorkflowDetailIcons";
import { CanvasNodeIconSlot, type CanvasIconRotate } from "./CanvasNodeIconSlot";
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

/**
 * Parse an optional trailing modifier group `@key=value[,key=value…]` off an icon token.
 * Uses a strict tail match (not the first `@`) so `http://user@host/icon.svg` stays intact.
 * Only `rot=0|90|180|270` is recognised today; unknown keys are ignored.
 */
const ICON_MODIFIER_SUFFIX_RE = /@([a-z]+=[a-z0-9]+(?:,[a-z]+=[a-z0-9]+)*)$/i;

function parseIconToken(raw: string): Readonly<{ body: string; rotate?: CanvasIconRotate }> {
  const match = raw.match(ICON_MODIFIER_SUFFIX_RE);
  if (!match) {
    return { body: raw };
  }
  const body = raw.slice(0, match.index ?? 0).trim();
  let rotate: CanvasIconRotate | undefined;
  for (const part of match[1].split(",")) {
    const [key, value] = part.split("=").map((s) => s.trim().toLowerCase());
    if (key === "rot" && value !== undefined) {
      const n = Number.parseInt(value, 10);
      if (n === 0 || n === 90 || n === 180 || n === 270) {
        rotate = n;
      }
    }
  }
  return rotate ? { body, rotate } : { body };
}

function renderInSlot(sizePx: number, rotate: CanvasIconRotate | undefined, children: ReactNode): ReactNode {
  return (
    <CanvasNodeIconSlot sizePx={sizePx} rotate={rotate}>
      {children}
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
 * Any of the above may be suffixed with `@rot=<0|90|180|270>` (and future modifiers)
 * to rotate the glyph so vertically-oriented source art reads in LTR workflow flow.
 *
 * Node configs set {@link import("@codemation/core").NodeConfigBase.icon}.
 */
export function WorkflowCanvasNodeIcon(
  props: Readonly<{
    icon?: string;
    sizePx: number;
    strokeWidth?: number;
    /** When `icon` is unset, Lucide fallback from node role (e.g. nested agent → Bot, not Boxes). */
    fallbackType?: string;
    fallbackRole?: string;
  }>,
) {
  const { icon, sizePx, strokeWidth = 2, fallbackRole } = props;
  const raw = icon?.trim();
  if (!raw) {
    const FallbackIcon = WorkflowNodeIconResolver.resolveFallback(fallbackRole);
    return renderInSlot(sizePx, undefined, <FallbackIcon size={sizePx} strokeWidth={strokeWidth} />);
  }
  const { body, rotate } = parseIconToken(raw);
  if (isHttpOrDataUrl(body)) {
    return renderInSlot(
      sizePx,
      rotate,
      <img src={body} alt="" style={{ ...IMG_STYLE, width: "100%", height: "100%" }} />,
    );
  }
  if (body.startsWith("builtin:")) {
    const id = body.slice("builtin:".length).trim().toLowerCase();
    const url = WorkflowCanvasBuiltinIconRegistry.resolveUrl(id);
    if (url) {
      return renderInSlot(
        sizePx,
        rotate,
        <img src={url} alt="" style={{ ...IMG_STYLE, width: "100%", height: "100%" }} />,
      );
    }
    return renderInSlot(sizePx, rotate, <Boxes size={sizePx} strokeWidth={strokeWidth} />);
  }
  if (body.startsWith("si:")) {
    const slug = body.slice("si:".length).trim().toLowerCase();
    const builtinUrl = WorkflowCanvasBuiltinIconRegistry.resolveUrl(slug);
    if (builtinUrl) {
      return renderInSlot(
        sizePx,
        rotate,
        <img src={builtinUrl} alt="" style={{ ...IMG_STYLE, width: "100%", height: "100%" }} />,
      );
    }
    const data = WorkflowCanvasSiIconRegistry.resolve(slug);
    if (data) {
      return renderInSlot(
        sizePx,
        rotate,
        <WorkflowCanvasSimpleIconGlyph title={data.title} path={data.path} hex={data.hex} sizePx={sizePx} />,
      );
    }
    return renderInSlot(sizePx, rotate, <Boxes size={sizePx} strokeWidth={strokeWidth} />);
  }
  const lucideName = body.startsWith("lucide:")
    ? body.slice("lucide:".length).trim().toLowerCase()
    : body.toLowerCase();
  return renderInSlot(
    sizePx,
    rotate,
    <Suspense fallback={<Boxes size={sizePx} strokeWidth={strokeWidth} />}>
      <DynamicIcon name={lucideName as IconName} size={sizePx} strokeWidth={strokeWidth} />
    </Suspense>,
  );
}
