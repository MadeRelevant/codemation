/**
 * Estimates wrapped line count for workflow canvas labels so Dagre layout height
 * matches rendered text (no ellipsis; conservative wrap).
 */
export class WorkflowCanvasLabelLayoutEstimator {
  private static readonly maxLinesCap = 80;

  /**
   * Word-wrap simulation in pixel space (approximate average Latin character width).
   */
  static estimateLineCount(text: string, maxContentWidthPx: number, fontSizePx: number): number {
    const t = text.trim();
    if (t.length === 0) {
      return 1;
    }
    const avgCharWidthPx = fontSizePx * 0.52;
    const spaceWidthPx = fontSizePx * 0.35;
    const words = t.split(/\s+/).filter((w) => w.length > 0);
    let lines = 1;
    let lineWidthPx = 0;
    for (const word of words) {
      const wordWidthPx = word.length * avgCharWidthPx;
      if (wordWidthPx > maxContentWidthPx) {
        if (lineWidthPx > 0) {
          lines += 1;
        }
        const wordLines = Math.ceil(wordWidthPx / maxContentWidthPx);
        lines += wordLines - 1;
        lineWidthPx = wordWidthPx % maxContentWidthPx || avgCharWidthPx * 0.5;
        continue;
      }
      const gapPx = lineWidthPx > 0 ? spaceWidthPx : 0;
      if (lineWidthPx + gapPx + wordWidthPx <= maxContentWidthPx + 0.5) {
        lineWidthPx += gapPx + wordWidthPx;
      } else {
        lines += 1;
        lineWidthPx = wordWidthPx;
      }
    }
    return Math.min(Math.max(1, lines), this.maxLinesCap);
  }
}
