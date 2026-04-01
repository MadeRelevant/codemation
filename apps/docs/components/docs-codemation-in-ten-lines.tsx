/**
 * Illustrative workflow snippet for the docs homepage — node classes after Gmail are placeholders for your own nodes.
 */
export function DocsCodemationInTenLines() {
  return (
    <div className="not-prose my-10" data-testid="docs-codemation-in-ten-lines">
      <div className="overflow-hidden rounded-2xl border border-neutral-800/90 bg-neutral-950 shadow-[0_24px_80px_-20px_rgba(0,0,0,0.55)] ring-1 ring-white/[0.06] dark:shadow-black/40">
        <div className="flex items-center gap-2 border-b border-white/[0.06] bg-neutral-900/80 px-4 py-2.5" aria-hidden>
          <span className="size-2.5 rounded-full bg-[#ff5f57]/90" />
          <span className="size-2.5 rounded-full bg-[#febc2e]/90" />
          <span className="size-2.5 rounded-full bg-[#28c840]/90" />
          <span className="ml-2 font-mono text-[11px] tracking-wide text-neutral-500">src/workflows/orders.ts</span>
        </div>
        <pre className="m-0 overflow-x-auto p-5 pb-6 font-mono text-[13px] leading-relaxed text-neutral-100 sm:p-6 sm:text-sm">
          <code>
            <span className="text-violet-400">import</span>
            {" { createWorkflowBuilder } "}
            <span className="text-violet-400">from</span>
            {' "'}
            <span className="text-emerald-400/95">@codemation/core-nodes</span>
            {'";\n'}
            <span className="text-violet-400">import</span>
            {" { OnNewGmailTrigger } "}
            <span className="text-violet-400">from</span>
            {' "'}
            <span className="text-emerald-400/95">@codemation/core-nodes-gmail/nodes/OnNewGmailTrigger</span>
            {'";\n\n'}
            <span className="text-violet-400">export default</span>
            {" createWorkflowBuilder({ id: "}
            <span className="text-amber-300/95">&quot;wf.orders.inbox&quot;</span>
            {", name: "}
            <span className="text-amber-300/95">&quot;Inbox → OCR → ERP → email&quot;</span>
            {" })\n"}
            {"  ."}
            <span className="text-sky-400">trigger</span>
            {"("}
            <span className="text-violet-400">new</span>
            {" OnNewGmailTrigger("}
            <span className="text-amber-300/95">&quot;Inbox&quot;</span>
            {", { mailbox: "}
            <span className="text-amber-300/95">&quot;orders@acme.com&quot;</span>
            {", downloadAttachments: "}
            <span className="text-orange-300">true</span>
            {" }))\n"}
            {"  ."}
            <span className="text-sky-400">then</span>
            {"("}
            <span className="text-violet-400">new</span>
            {" InvoiceOcr({ preset: "}
            <span className="text-amber-300/95">&quot;invoice&quot;</span>
            {" }))\n"}
            {"  ."}
            <span className="text-sky-400">then</span>
            {"("}
            <span className="text-violet-400">new</span>
            {" SyncOrder({ system: "}
            <span className="text-amber-300/95">&quot;erp&quot;</span>
            {" }))\n"}
            {"  ."}
            <span className="text-sky-400">then</span>
            {"("}
            <span className="text-violet-400">new</span>
            {" SendOrderEmail({ template: "}
            <span className="text-amber-300/95">&quot;ack&quot;</span>
            {" }))\n"}
            {"  ."}
            <span className="text-sky-400">build</span>
            {"();"}
          </code>
        </pre>
      </div>
      <p className="mt-3 text-center text-xs text-neutral-500 dark:text-neutral-500">
        Illustrative only —{" "}
        <code className="rounded bg-neutral-200/80 px-1.5 py-0.5 font-mono text-[11px] text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200">
          InvoiceOcr
        </code>
        ,{" "}
        <code className="rounded bg-neutral-200/80 px-1.5 py-0.5 font-mono text-[11px] text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200">
          SyncOrder
        </code>
        , and{" "}
        <code className="rounded bg-neutral-200/80 px-1.5 py-0.5 font-mono text-[11px] text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200">
          SendOrderEmail
        </code>{" "}
        are your own nodes.
      </p>
    </div>
  );
}
