/**
 * Built-in canvas icons (brand marks, etc.) shipped as **SVG files** under `public/canvas-icons/builtin/`.
 * One SVG asset per id, square or near-square artboard, no per-brand TSX.
 *
 * To add a builtin:
 * 1. Add `public/canvas-icons/builtin/<id>.svg` (prefer square viewBox; optimize with SVGO).
 * 2. Register the URL in {@link BUILTIN_CANVAS_ICON_URLS}.
 */
const CANVAS_BUILTIN_ICON_BASE = "/canvas-icons/builtin";

export const BUILTIN_CANVAS_ICON_URLS: Readonly<Record<string, string>> = {
  openai: `${CANVAS_BUILTIN_ICON_BASE}/openai.svg`,
  "split-rows": `${CANVAS_BUILTIN_ICON_BASE}/split-rows.svg`,
  "aggregate-rows": `${CANVAS_BUILTIN_ICON_BASE}/aggregate-rows.svg`,
} as const;

export type BuiltinCanvasIconId = keyof typeof BUILTIN_CANVAS_ICON_URLS;

export class WorkflowCanvasBuiltinIconRegistry {
  static resolveUrl(id: string): string | undefined {
    const key = id.trim().toLowerCase();
    return BUILTIN_CANVAS_ICON_URLS[key];
  }

  static has(id: string): boolean {
    return WorkflowCanvasBuiltinIconRegistry.resolveUrl(id) !== undefined;
  }
}
