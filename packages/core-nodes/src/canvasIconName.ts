/**
 * Canvas / agent presentation:
 * - Lucide: `lucide:<kebab-name>` or legacy kebab name
 * - Built-in brand SVGs: `builtin:<id>` (host resolves to shipped SVG assets under `public/canvas-icons/builtin/`)
 * - Simple Icons: `si:<slug>` (host cherry-picks from `simple-icons`) or builtin asset when slug matches
 * - Image URLs: `http(s):`, `data:`, `/…`
 */
export type CanvasIconName = string;
