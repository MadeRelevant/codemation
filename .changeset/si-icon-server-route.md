---
"@codemation/canvas-core": patch
"@codemation/next-host": patch
"@codemation/cli": patch
---

Move `simple-icons` SVG data out of the client bundle. Named imports from the ~5.2 MB `simple-icons` barrel are replaced by a server-side `/api/si-icon/[slug]` route that reads SVG files from disk, mirroring the `lucide-react` fix from commit 54c3a392. Canvas `si:` icons now render via CSS `mask-image` (same pattern as lucide remote glyphs). OAuth provider icons switch to a small inline path+hex map, eliminating the barrel import entirely. `simple-icons` removed from `optimizePackageImports` in `next.config.ts` as it is no longer imported client-side.
