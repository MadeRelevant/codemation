---
"@codemation/next-host": patch
---

Expand the curated lucide icon registry with 16 commonly-used semantic icons (`building-2`, `database`, `file-text`, `folder-input`, `list-checks`, `mail`, `mail-open`, `message-square`, `paperclip`, `receipt`, `scan-text`, `shopping-cart`, `tag`, `truck`, `user-check`, `user-plus`, `user-search`). These are the icons consumer projects routinely reach for when iconing their custom nodes — without them, names like `lucide:mail` silently fell through to the question-mark fallback. The registry stays static (per-icon ESM imports) so bundle size impact is bounded; brand-specific icons should still prefer `builtin:` / `si:` / URL.
