import { Download } from "lucide-react";

import { WorkflowInspectorAttachmentGroupingPresenter } from "./WorkflowInspectorAttachmentGroupingPresenter";
import type { WorkflowExecutionInspectorAttachmentModel } from "../../lib/workflowDetail/workflowDetailTypes";

export function WorkflowInspectorAttachmentList(
  args: Readonly<{ attachments: ReadonlyArray<WorkflowExecutionInspectorAttachmentModel> }>,
) {
  if (args.attachments.length === 0) {
    return null;
  }

  const groupedAttachments = WorkflowInspectorAttachmentGroupingPresenter.buildGroups(args.attachments);

  return (
    <div data-testid="workflow-inspector-attachments" style={{ display: "grid", gap: 10, marginBottom: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.45, textTransform: "uppercase", opacity: 0.72 }}>
        Attachments
      </div>
      {groupedAttachments.groups.map((group) => (
        <div
          key={`attachment-group-${group.itemIndex}`}
          data-testid={`workflow-inspector-attachment-group-item-${group.itemIndex + 1}`}
          style={{ display: "grid", gap: 10 }}
        >
          {groupedAttachments.shouldShowGroupHeadings ? (
            <div
              data-testid={`workflow-inspector-attachment-group-label-item-${group.itemIndex + 1}`}
              style={{
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: 0.35,
                textTransform: "uppercase",
                color: "#475569",
              }}
            >
              {`Item ${group.itemIndex + 1}`}
            </div>
          ) : null}
          {group.attachments.map((entry) => (
            <div
              key={entry.key}
              data-testid={`workflow-inspector-attachment-${entry.attachment.id}`}
              style={{ border: "1px solid #d1d5db", background: "#ffffff", padding: 12, display: "grid", gap: 10 }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>{entry.name}</div>
                  <div style={{ marginTop: 4, fontSize: 12, color: "#6b7280" }}>
                    {`${groupedAttachments.shouldShowGroupHeadings ? "" : `Item ${entry.itemIndex + 1} · `}${entry.attachment.mimeType} · ${entry.attachment.size} bytes`}
                  </div>
                </div>
                <a
                  data-testid={`workflow-inspector-attachment-link-${entry.attachment.id}`}
                  href={entry.contentUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    border: "1px solid #d1d5db",
                    background: "white",
                    color: "#111827",
                    padding: "6px 10px",
                    fontWeight: 700,
                    fontSize: 12,
                    textDecoration: "none",
                  }}
                >
                  <Download size={14} strokeWidth={2.1} />
                  {entry.attachment.previewKind === "download" ? "Download" : "Open"}
                </a>
              </div>
              {entry.attachment.previewKind === "image" ? (
                <img
                  data-testid={`workflow-inspector-image-preview-${entry.attachment.id}`}
                  src={entry.contentUrl}
                  alt={entry.attachment.filename ?? entry.name}
                  style={{
                    maxWidth: "100%",
                    maxHeight: 260,
                    objectFit: "contain",
                    background: "#f8fafc",
                    border: "1px solid #e5e7eb",
                  }}
                />
              ) : null}
              {entry.attachment.previewKind === "audio" ? (
                <audio
                  data-testid={`workflow-inspector-audio-preview-${entry.attachment.id}`}
                  controls
                  src={entry.contentUrl}
                />
              ) : null}
              {entry.attachment.previewKind === "video" ? (
                <video
                  data-testid={`workflow-inspector-video-preview-${entry.attachment.id}`}
                  controls
                  src={entry.contentUrl}
                  style={{ maxWidth: "100%", maxHeight: 260, background: "#020617" }}
                />
              ) : null}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
