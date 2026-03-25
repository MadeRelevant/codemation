# Tailwind v4 + shadcn/ui migration (next-host)

## Goal

Replace ad-hoc global CSS with **Tailwind CSS v4**, **design tokens** (CSS variables + `@theme inline`), and **shadcn/ui** primitives (Radix + copy-paste components). Prepare for **dashboards** later (Recharts + TanStack Table + shadcn chart patterns).

## Inventory (refactor surface)

| Area                                                                          | Notes                                                                                                                                                                                                                                                                        |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`app/globals.css`**                                                         | ~1.5k lines after bootstrap: Tailwind imports + shadcn theme + **legacy** BEM-style rules (to delete incrementally).                                                                                                                                                         |
| **`app/`**                                                                    | `layout.tsx`, `(shell)/layout.tsx`, `login/layout.tsx`, route `page.tsx` files — shell chrome and page wrappers.                                                                                                                                                             |
| **`src/shell/`**                                                              | App layout, sidebar, header, login client — high-value for first Tailwind passes.                                                                                                                                                                                            |
| **`src/features/credentials/`** (`screens/`, `components/`, `hooks/`, `lib/`) | Tables, dialogs, forms — migrate to `Button`, `Input`, `Dialog`, etc.                                                                                                                                                                                                        |
| **`src/features/users/`**, **`invite/`**                                      | Same layout (`screens/` + `components/` where needed).                                                                                                                                                                                                                       |
| **`src/features/workflows/`**                                                 | Largest surface: `screens/`, `components/{workflowDetail,canvas,realtime}/`, `hooks/`, `lib/{workflowDetail,realtime}/` — canvas helpers live under **`components/canvas/lib/`** (layout, edge resolvers, embedded styles). Many **inline `style={{}}`** (~200+ in package). |
| **CSS-in-TS**                                                                 | `components/canvas/lib/workflowCanvasEmbeddedStyles.ts`, `lib/workflowDetailTreeStyles.ts` — keep minimal (keyframes, third-party overrides); rest → utilities/tokens.                                                                                                       |
| **Vendor CSS**                                                                | `@xyflow/react/dist/style.css`, `rc-tree/assets/index.css` — keep; override with scoped classes or tokens.                                                                                                                                                                   |
| **`src/components/`**                                                         | Shared widgets (`CodemationDataTable`, etc.) — adopt primitives + `cn()`.                                                                                                                                                                                                    |

**Approximate counts (pre-migration):** ~230 `className=` in `.tsx`; ~238 `style={{` in `.tsx` (workflows-heavy).

## What’s done (bootstrap)

- **Tailwind v4** via `@tailwindcss/postcss` + `postcss.config.mjs`.
- **`shadcn` CLI package** + **`tw-animate-css`**, **`class-variance-authority`**, **`clsx`**, **`tailwind-merge`**.
- **`radix-ui`** (unified Radix primitives; required by **radix-nova** generated components such as `Button`).
- **`components.json`** (`style: radix-nova`, `css: app/globals.css`, Lucide).
- **`src/lib/utils.ts`** — `cn()` helper for class merging.
- **`tsconfig`**: `baseUrl: "."`, `@/*` → `./src/*`, workspace aliases as **paths relative to `packages/next-host`** (required for Next + `@codemation/*` resolution).
- **`app/globals.css`**: `@import "tailwindcss"`, `tw-animate-css`, `shadcn/tailwind.css`; `@theme inline`; shadcn `:root` / `.dark`; `@layer base`; **legacy bridge** (`--color-*`, `--sidebar-*`, spacing, buttons) → tokens; **legacy class rules** retained until screens migrate.

## Phased rollout

1. **Primitives** — `pnpm dlx shadcn@latest add button input label dialog select tabs table ...` into `src/components/ui/`. Use `@/components/ui/*` imports.
2. **Shell** — Replace `.app-*` classes in `AppLayout` / nav with Tailwind + tokens; shrink `globals.css` sections.
3. **Feature screens** — Credentials → Users → Invite → Workflows list → Workflow detail (inspector before canvas if easier).
4. **Canvas** — Last: XYFlow needs pixel layout; prefer tokens + minimal inline where unavoidable.
5. **Dashboards (later)** — Add **Recharts** + shadcn chart recipe; **TanStack Table** for dense grids; optional **Tremor** blocks only if needed.

## Dark mode

- Tokens already include `.dark` in `globals.css`. Add a **theme toggle** that sets `class="dark"` on `document.documentElement` (or `next-themes` when you add it).

## ESLint / consistency

- Keep **no Server Actions** rule in `packages/next-host`.
- Root config enables **`no-alert`** (blocks `alert()`, `confirm()`, `prompt()` — use in-app UI). In **next-host** we extend the same idea for markup: **`no-restricted-syntax`** flags native **`<select>`** so agents use **`@/components/ui/select`** (Radix) instead of inconsistent browser styling and `change`-event tests.
- Prefer **semantic utilities** (`bg-background`, `text-muted-foreground`) over raw palette classes in new code.
- Optionally add **lint for raw `gray-*`** in a follow-up (team decision).

## Buttons vs badges

- **`Button`** (`src/components/ui/button.tsx`): **squarer corners** (`rounded-md`, smaller sizes `rounded-sm`), light **`shadow-sm`** on filled variants — reads as an actionable control.
- **`Badge`** (`src/components/ui/badge.tsx`): **pill** shape (`rounded-full`), **`shadow-none`** — reads as status/metadata, not a primary action.

## Composed dialogs (`CodemationDialog`)

Use [`src/components/CodemationDialog.tsx`](src/components/CodemationDialog.tsx) for modal shells instead of hand-rolled `fixed inset-0` overlays. It wraps Radix **`Dialog`** + **`DialogContent`** (focus trap, escape, overlay) with a consistent layout:

```tsx
<CodemationDialog onClose={...} testId="..." size="wide" role="dialog">
  <CodemationDialog.Title>Title</CodemationDialog.Title>
  <CodemationDialog.Content>{/* scrollable body */}</CodemationDialog.Content>
  <CodemationDialog.Actions position="bottom">{/* buttons */}</CodemationDialog.Actions>
</CodemationDialog>
```

- **`CodemationDialog.Actions`** — `position="top" | "bottom"` (default `bottom`), `align="start" | "end" | "between"`.
- **`size`** — `narrow` (~`lg`), `wide` (~`2xl`), `full`.
- **Do not pass `id` to `CodemationDialog.Title`** — Radix assigns `titleId` in context; overriding `id` on `DialogTitle` breaks `aria-labelledby` and triggers dev warnings.
- Optional **`role="alertdialog"`** for confirmations (e.g. delete confirm).

## Verification (avoid heavy full-repo gates)

Iterating on UI only:

1. `pnpm --filter @codemation/next-host run lint`
2. `pnpm run test:ui` (from repo root; host UI tests import next-host with `@/` alias)

Use **`pnpm --filter @codemation/next-host run build`** when you need a Next production compile without building all workspace packages.

Reserve **root `pnpm test`** / **`pnpm check`** / wide **`turbo run build`** for **CI or pre-merge** — they rebuild many packages and run all suites (high CPU/time).

## References

- [Tailwind + Next.js](https://tailwindcss.com/docs/installation/framework-guides/nextjs)
- [shadcn manual install](https://ui.shadcn.com/docs/installation/manual)
- [Tailwind v4 + shadcn](https://ui.shadcn.com/docs/tailwind-v4)
