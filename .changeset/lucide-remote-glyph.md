---
"@codemation/next-host": minor
---

Consumer-supplied `lucide:<name>` icons now resolve to any of lucide's 1,700+ glyphs without needing a framework PR — names not in the curated registry render via `WorkflowCanvasLucideRemoteGlyph`, a CSS `mask-image` pointing at the new `/api/lucide-icon/<name>.svg` route. The route serves SVGs from `lucide-static` server-side; the full icon set never enters the client bundle (the May 2026 OOM regression — commit ddaa265f — is preserved). The curated registry stays as the fast path for icons used by core node plugins (sync, no HTTP, no flicker). Browser caches each unique icon forever (`Cache-Control: immutable`).
