---
"@codemation/next-host": patch
---

Collections UI polish:

- Click a collection name in `/collections` to open its rows (was a separate "View rows" link column).
- Match the users / credentials design system: drop the card border around the rows table, use the shared `CodemationFormattedDateTime` for created/updated, plain text Edit/Delete buttons (size="sm") with destructive coloring on Delete, outline badges with muted-foreground text in the index.
- Bulk delete: per-row checkbox + header select-all (with indeterminate state), "Delete selected (N)" button in the header, confirmation dialog. Implementation is sequential client-side delete via the existing single-row mutation. Selection drops rows that leave the page.

Adds a shadcn `Checkbox` primitive (we only had `Switch`).
