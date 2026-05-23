"use client";
import Bot from "lucide-react/dist/esm/icons/bot";
import Brain from "lucide-react/dist/esm/icons/brain";
import CircleHelp from "lucide-react/dist/esm/icons/circle-help";
import Wrench from "lucide-react/dist/esm/icons/wrench";
import type { LucideIcon } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

import {
  useWorkflowCanvasConfig,
  WorkflowCanvasBuiltinIconRegistry,
  WorkflowCanvasLucideIconRegistry,
  WorkflowCanvasSiIconRegistry,
} from "@codemation/canvas-core";
import { CanvasNodeIconSlot, type CanvasIconRotate } from "./CanvasNodeIconSlot";
import { WorkflowCanvasLucideRemoteGlyph } from "./WorkflowCanvasLucideRemoteGlyph";
import { WorkflowCanvasSiRemoteGlyph } from "./WorkflowCanvasSiRemoteGlyph";

/**
 * Role-only Lucide fallback for a node when no explicit `icon` is set.
 *
 * TODO(Phase 4): Once WorkflowDetailIcons is moved into canvas, import WorkflowNodeIconResolver
 * from its canonical location instead of this inline copy.
 */
class WorkflowNodeIconResolver {
  static resolveFallback(role?: string): LucideIcon {
    if (role === "agent" || role === "nestedAgent") return Bot;
    if (role === "languageModel") return Brain;
    if (role === "tool") return Wrench;
    return CircleHelp;
  }
}

const LUCIDE_NAME_RE = /^[a-z][a-z0-9-]*$/;

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
 * - **`lucide:<name>`** or legacy kebab name — Lucide icon. Names used by core node plugins
 *   render via the curated `WorkflowCanvasLucideIconRegistry` (sync, no HTTP). Any other valid
 *   lucide kebab name renders via {@link WorkflowCanvasLucideRemoteGlyph} — a CSS `mask-image`
 *   pointing at `/api/lucide-icon/<name>.svg`, served from `lucide-static` server-side. The full
 *   lucide set is therefore reachable without bloating the client bundle (commit ddaa265f).
 *   Names that don't match the lucide kebab pattern fall back to a question-mark glyph.
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
    /** When `icon` is unset, Lucide fallback from node role (e.g. nested agent → Bot, otherwise question mark). */
    fallbackType?: string;
    fallbackRole?: string;
  }>,
) {
  const { icon, sizePx, strokeWidth = 2, fallbackRole } = props;
  const canvasConfig = useWorkflowCanvasConfig();
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
    return renderInSlot(sizePx, rotate, <CircleHelp size={sizePx} strokeWidth={strokeWidth} />);
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
    const url = WorkflowCanvasSiIconRegistry.resolve(slug);
    if (url) {
      return renderInSlot(sizePx, rotate, <WorkflowCanvasSiRemoteGlyph url={url} sizePx={sizePx} />);
    }
    return renderInSlot(sizePx, rotate, <CircleHelp size={sizePx} strokeWidth={strokeWidth} />);
  }
  if (canvasConfig?.iconRegistries) {
    for (const registry of canvasConfig.iconRegistries) {
      const ConsumerIcon = registry.resolveIcon(body);
      if (ConsumerIcon) {
        return renderInSlot(sizePx, rotate, <ConsumerIcon />);
      }
    }
  }
  const lucideName = body.startsWith("lucide:")
    ? body.slice("lucide:".length).trim().toLowerCase()
    : body.toLowerCase();
  const Icon = WorkflowCanvasLucideIconRegistry.resolve(lucideName);
  if (Icon) {
    return renderInSlot(sizePx, rotate, <Icon size={sizePx} strokeWidth={strokeWidth} />);
  }
  if (LUCIDE_NAME_RE.test(lucideName)) {
    return renderInSlot(sizePx, rotate, <WorkflowCanvasLucideRemoteGlyph name={lucideName} sizePx={sizePx} />);
  }
  return renderInSlot(sizePx, rotate, <CircleHelp size={sizePx} strokeWidth={strokeWidth} />);
}
