/**
 * One label/value row in the {@link NodeInspectorSummarySection} grid.
 *
 * Lives in its own file because the project's ESLint rule
 * `codemation/single-react-component-per-file` mandates it.
 */
export function NodeInspectorSummaryRow(args: Readonly<{ label: string; value: string }>) {
  return (
    <>
      <dt className="text-[11px] font-extrabold tracking-wide text-muted-foreground uppercase opacity-80 whitespace-nowrap">
        {args.label}
      </dt>
      <dd className="text-xs leading-relaxed break-words text-foreground whitespace-pre-wrap">{args.value}</dd>
    </>
  );
}
