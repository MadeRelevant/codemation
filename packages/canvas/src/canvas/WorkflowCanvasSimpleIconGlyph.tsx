/**
 * Renders a Simple Icons path in a 24×24 viewBox (same coordinate space as Lucide for sizing).
 */
export function WorkflowCanvasSimpleIconGlyph(
  props: Readonly<{ title: string; path: string; hex: string; sizePx: number }>,
) {
  const { title, path, hex, sizePx } = props;
  return (
    <svg
      role="img"
      viewBox="0 0 24 24"
      width={sizePx}
      height={sizePx}
      aria-hidden
      style={{ display: "block", backgroundColor: "transparent" }}
    >
      <title>{title}</title>
      <path fill={`#${hex}`} d={path} />
    </svg>
  );
}
