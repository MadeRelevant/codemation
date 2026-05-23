---
"@codemation/next-host": patch
---

style(next-host/canvas-adapter): replace inline styles with Tailwind tokens (Sprint 14 Story 11)

Replaced hardcoded `style={{}}` blocks in `NextHostCredentialBindingsRenderer` with Tailwind
utility classes using design tokens (`border-border`, `bg-card`, `text-danger`, semantic spacing).
Added smoke test asserting no `style=` props in the rendered credential section markup.
