---
"@codemation/next-host": patch
---

Guard catch-all API route from shadowing /api/lucide-icon/\* by extracting icon logic into a shared helper and adding an early-return in the catch-all GET handler.
