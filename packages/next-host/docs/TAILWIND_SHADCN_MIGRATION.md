# Tailwind v4 + shadcn/ui migration (next-host)

## Goal

Replace ad-hoc global CSS with **Tailwind CSS v4**, **design tokens** (CSS variables + `@theme inline`), and **shadcn/ui** primitives (Radix + copy-paste components). Prepare for **dashboards** later (Recharts + TanStack Table + shadcn chart patterns).

## Inventory (refactor surface)

| Area | Notes |
|------|--------|
| **`app/globals.css`** | ~1.5k lines after bootstrap: Tailwind imports + shadcn theme + **legacy** BEM-style rules (to delete incrementally). |
| **`app/`** | `layout.tsx`, `(shell)/layout.tsx`, `login/layout.tsx`, route `page.tsx` files — shell chrome and page wrappers. |
| **`src/shell/`** | App layout, sidebar, header, login client — high-value for first Tailwind passes. |
| **`src/features/credentials/`** | Tables, dialogs, forms — migrate to `Button`, `Input`, `Dialog`, etc. |
| **`src/features/users/`**, **`invite/`** | Same. |
| **`src/features/workflows/`** | Largest surface: list, detail, **canvas** (XYFlow), inspector, realtime — many **inline `style={{}}`** (~200+ in package). |
| **CSS-in-TS** | `workflowCanvasEmbeddedStyles.ts`, `workflowDetailTreeStyles.ts` — keep minimal (keyframes, third-party overrides); rest → utilities/tokens. |
| **Vendor CSS** | `@xyflow/react/dist/style.css`, `rc-tree/assets/index.css` — keep; override with scoped classes or tokens. |
| **`src/components/`** | Shared widgets (`CodemationDataTable`, etc.) — adopt primitives + `cn()`. |

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
- Prefer **semantic utilities** (`bg-background`, `text-muted-foreground`) over raw palette classes in new code.
- Optionally add **lint for raw `gray-*`** in a follow-up (team decision).

## References

- [Tailwind + Next.js](https://tailwindcss.com/docs/installation/framework-guides/nextjs)
- [shadcn manual install](https://ui.shadcn.com/docs/installation/manual)
- [Tailwind v4 + shadcn](https://ui.shadcn.com/docs/tailwind-v4)
