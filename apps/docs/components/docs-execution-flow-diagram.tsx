/**
 * Conceptual diagram for the execution model page — matches docs homepage dark “code window” styling.
 */
export function DocsExecutionFlowDiagram() {
  return (
    <div className="not-prose my-10" data-testid="docs-execution-flow-diagram">
      <div className="overflow-hidden rounded-2xl border border-neutral-800/90 bg-neutral-950 shadow-[0_24px_80px_-20px_rgba(0,0,0,0.55)] ring-1 ring-white/[0.06] dark:shadow-black/40">
        <div className="flex items-center gap-2 border-b border-white/[0.06] bg-neutral-900/80 px-4 py-2.5" aria-hidden>
          <span className="size-2.5 rounded-full bg-[#ff5f57]/90" />
          <span className="size-2.5 rounded-full bg-[#febc2e]/90" />
          <span className="size-2.5 rounded-full bg-[#28c840]/90" />
          <span className="ml-2 font-mono text-[11px] tracking-wide text-neutral-500">
            Activation → per-item execute
          </span>
        </div>
        <div
          className="grid gap-6 p-6 sm:p-8"
          role="img"
          aria-label="Execution flow: one activation batch of items, then the engine runs execute once per item, then outputs on main, emitPorts, or router ports."
        >
          <div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-center">
            <div className="relative rounded-xl border border-white/[0.08] bg-gradient-to-br from-violet-500/15 to-transparent p-4 ring-1 ring-violet-500/35">
              <div className="font-mono text-[11px] font-semibold uppercase tracking-wide text-neutral-300">
                Activation batch
              </div>
              <div className="mt-1.5 text-[13px] leading-snug text-neutral-400">Items[] from trigger or upstream</div>
            </div>
            <div className="hidden items-center justify-center px-1 sm:flex" aria-hidden>
              <span className="font-mono text-lg text-neutral-500">→</span>
            </div>
            <div className="relative rounded-xl border border-white/[0.08] bg-gradient-to-br from-sky-400/12 to-transparent p-4 ring-1 ring-sky-400/35">
              <div className="font-mono text-[11px] font-semibold uppercase tracking-wide text-neutral-300">
                Per item
              </div>
              <div className="mt-1.5 text-[13px] leading-snug text-neutral-400">
                execute(args) — input, item, batch context
              </div>
            </div>
            <div className="hidden items-center justify-center px-1 sm:flex" aria-hidden>
              <span className="font-mono text-lg text-neutral-500">→</span>
            </div>
            <div className="relative rounded-xl border border-white/[0.08] bg-gradient-to-br from-emerald-400/12 to-transparent p-4 ring-1 ring-emerald-400/35">
              <div className="font-mono text-[11px] font-semibold uppercase tracking-wide text-neutral-300">
                Outputs
              </div>
              <div className="mt-1.5 text-[13px] leading-snug text-neutral-400">main · emitPorts · router ports</div>
            </div>
          </div>
          <p className="m-0 text-center text-[13px] leading-relaxed text-neutral-400">
            Routers (If, Switch) tag lineage for merge-by-origin when branches reconverge.
          </p>
        </div>
      </div>
    </div>
  );
}
