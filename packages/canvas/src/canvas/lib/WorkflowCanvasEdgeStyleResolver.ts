export class WorkflowCanvasEdgeStyleResolver {
  private static readonly activeMainStroke = "#111827";
  private static readonly activeAttachmentStroke = "#94a3b8";
  private static readonly inactiveMainStroke = "#9ca3af";
  private static readonly inactiveAttachmentStroke = "#cbd5e1";
  private static readonly activeMainLabelFill = "#111827";
  private static readonly activeAttachmentLabelFill = "#475569";
  private static readonly inactiveMainLabelFill = "#6b7280";
  private static readonly inactiveAttachmentLabelFill = "#94a3b8";
  private static readonly activeMainLabelBackground = "rgba(255,253,245,0.96)";
  private static readonly activeAttachmentLabelBackground = "rgba(248,250,252,0.92)";
  private static readonly inactiveMainLabelBackground = "rgba(249,250,251,0.96)";
  private static readonly inactiveAttachmentLabelBackground = "rgba(248,250,252,0.72)";

  static resolveStrokeColor(args: Readonly<{ edgeItemCount: number; isAttachmentEdge: boolean }>): string {
    if (args.edgeItemCount > 0) {
      return args.isAttachmentEdge ? this.activeAttachmentStroke : this.activeMainStroke;
    }
    return args.isAttachmentEdge ? this.inactiveAttachmentStroke : this.inactiveMainStroke;
  }

  static resolveLabelFill(args: Readonly<{ edgeItemCount: number; isAttachmentEdge: boolean }>): string {
    if (args.edgeItemCount > 0) {
      return args.isAttachmentEdge ? this.activeAttachmentLabelFill : this.activeMainLabelFill;
    }
    return args.isAttachmentEdge ? this.inactiveAttachmentLabelFill : this.inactiveMainLabelFill;
  }

  static resolveLabelBackground(args: Readonly<{ edgeItemCount: number; isAttachmentEdge: boolean }>): string {
    if (args.edgeItemCount > 0) {
      return args.isAttachmentEdge ? this.activeAttachmentLabelBackground : this.activeMainLabelBackground;
    }
    return args.isAttachmentEdge ? this.inactiveAttachmentLabelBackground : this.inactiveMainLabelBackground;
  }
}
