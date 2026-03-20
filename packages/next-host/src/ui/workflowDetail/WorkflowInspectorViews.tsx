import JsonView from "@uiw/react-json-view";


import { githubLightTheme } from "@uiw/react-json-view/githubLight";


import { Check,Copy,Download } from "lucide-react";


import { useEffect,useMemo,useState,type ReactNode } from "react";


import { WorkflowInspectorAttachmentGroupingPresenter } from "./WorkflowInspectorAttachmentGroupingPresenter";
import { WorkflowInspectorPrettyTreeViewRenderer } from "./WorkflowInspectorPrettyTreeViewRenderer";
import type {
CopyState,
NodeExecutionError,
PrettyJsonTreeNode,
WorkflowExecutionInspectorAttachmentModel,
} from "./workflowDetailTypes";

class WorkflowInspectorPrettyTreePresenter {
  static buildTreeData(value: unknown): ReadonlyArray<PrettyJsonTreeNode> {
    if (value === undefined) {
      return [];
    }
    if (Array.isArray(value)) {
      if (value.length === 0) {
        return [this.createEmptyCollectionNode("value", "Array(0)", "pretty-root")];
      }
      return value.map((entry, index) => this.createNode(`[${index}]`, entry, `pretty-root.${index}`));
    }
    if (this.isRecord(value)) {
      const entries = Object.entries(value);
      if (entries.length === 0) {
        return [this.createEmptyCollectionNode("value", "Object(0)", "pretty-root")];
      }
      return entries.map(([key, entry]) => this.createNode(key, entry, `pretty-root.${key}`));
    }
    return [this.createNode("value", value, "pretty-root.value")];
  }

  static collectKeys(nodes: ReadonlyArray<PrettyJsonTreeNode>): ReadonlyArray<string> {
    const keys: string[] = [];
    this.collectKeysRecursive(nodes, keys);
    return keys;
  }

  private static collectKeysRecursive(nodes: ReadonlyArray<PrettyJsonTreeNode>, keys: string[]): void {
    for (const node of nodes) {
      const children = node.children ?? [];
      if (children.length > 0) {
        keys.push(node.key);
        this.collectKeysRecursive(children, keys);
      }
    }
  }

  private static createNode(label: string, value: unknown, key: string): PrettyJsonTreeNode {
    if (Array.isArray(value)) {
      const children = value.map((entry, index) => this.createNode(`[${index}]`, entry, `${key}.${index}`));
      if (children.length === 0) {
        return {
          key,
          label,
          inlineValue: this.renderInlineValue("[]"),
          isLeaf: true,
        };
      }
      return {
        key,
        label,
        children,
        isLeaf: false,
      };
    }
    if (this.isRecord(value)) {
      const children = Object.entries(value).map(([childKey, childValue]) => this.createNode(childKey, childValue, `${key}.${childKey}`));
      if (children.length === 0) {
        return {
          key,
          label,
          inlineValue: this.renderInlineValue("{}"),
          isLeaf: true,
        };
      }
      return {
        key,
        label,
        children,
        isLeaf: false,
      };
    }
    const multilineValue = typeof value === "string" && value.includes("\n") ? value : undefined;
    return {
      key,
      label,
      inlineValue: multilineValue ? undefined : this.renderInlineValue(value),
      multilineValue,
      isLeaf: true,
    };
  }

  private static createEmptyCollectionNode(label: string, summary: string, key: string): PrettyJsonTreeNode {
    return {
      key,
      label,
      inlineValue: this.renderInlineValue(summary === "Array(0)" ? "[]" : "{}"),
      isLeaf: true,
    };
  }

  private static renderInlineValue(value: unknown): ReactNode {
    if (typeof value === "string") {
      return (
        <span style={{ color: "#0f766e", fontSize: 12, lineHeight: 1.5, wordBreak: "break-word" }}>
          {value === "" ? '""' : value}
        </span>
      );
    }
    if (typeof value === "number" || typeof value === "boolean" || value === null) {
      return (
        <span
          style={{
            border: "1px solid #d1d5db",
            background: "#ffffff",
            color: "#334155",
            fontSize: 11,
            fontWeight: 700,
            padding: "1px 6px",
          }}
        >
          {String(value)}
        </span>
      );
    }
    return <span style={{ color: "#64748b", fontSize: 12, lineHeight: 1.5 }}>{value === undefined ? "undefined" : JSON.stringify(value)}</span>;
  }

  private static isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }
}



export function WorkflowInspectorJsonView(args: Readonly<{ value: unknown; emptyLabel: string }>) {
  const { value, emptyLabel } = args;
  const [collapsedLevel, setCollapsedLevel] = useState<boolean | number>(1);
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const isRenderableJson = value !== null && typeof value === "object";

  if (value === undefined) {
    return <div data-testid="workflow-inspector-empty-state" style={{ opacity: 0.62, fontSize: 13 }}>{emptyLabel}</div>;
  }

  return (
    <div style={{ height: "100%", minHeight: 0, display: "grid", gridTemplateRows: "auto 1fr", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button onClick={() => setCollapsedLevel(true)} style={{ border: "1px solid #d1d5db", background: "white", padding: "6px 10px", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>
            Collapse all
          </button>
          <button onClick={() => setCollapsedLevel(false)} style={{ border: "1px solid #d1d5db", background: "white", padding: "6px 10px", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>
            Expand all
          </button>
        </div>
        <div data-testid="workflow-inspector-json-copy-hint" style={{ fontSize: 12, opacity: 0.65 }}>
          {copyState === "copied" ? "Copied to clipboard" : "Use the copy icon in the viewer"}
        </div>
      </div>
      <div data-testid="workflow-inspector-json-panel" style={{ minWidth: 0, overflowX: "hidden", overflowY: "auto", border: "1px solid #d1d5db", background: "#f8fafc", padding: 12 }}>
        {isRenderableJson ? (
          <div style={{ minWidth: 0, overflowWrap: "anywhere", wordBreak: "break-word" }}>
            <JsonView
              value={value as object}
              collapsed={collapsedLevel}
              enableClipboard
              displayDataTypes={false}
              displayObjectSize
              shortenTextAfterLength={0}
              style={{
                ...githubLightTheme,
                backgroundColor: "transparent",
                padding: 0,
                fontSize: 12,
                lineHeight: 1.6,
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
              }}
              onCopied={() => {
                setCopyState("copied");
                window.setTimeout(() => setCopyState("idle"), 1500);
              }}
              onExpand={() => {
                if (copyState === "copied") setCopyState("idle");
              }}
            />
          </div>
        ) : (
          <pre style={{ margin: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere", wordBreak: "break-word", fontSize: 12, lineHeight: 1.6, color: "#111827", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
            {JSON.stringify(value, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}



export function WorkflowInspectorAttachmentList(args: Readonly<{ attachments: ReadonlyArray<WorkflowExecutionInspectorAttachmentModel> }>) {
  if (args.attachments.length === 0) {
    return null;
  }

  const groupedAttachments = WorkflowInspectorAttachmentGroupingPresenter.buildGroups(args.attachments);

  return (
    <div data-testid="workflow-inspector-attachments" style={{ display: "grid", gap: 10, marginBottom: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.45, textTransform: "uppercase", opacity: 0.72 }}>Attachments</div>
      {groupedAttachments.groups.map((group) => (
        <div
          key={`attachment-group-${group.itemIndex}`}
          data-testid={`workflow-inspector-attachment-group-item-${group.itemIndex + 1}`}
          style={{ display: "grid", gap: 10 }}
        >
          {groupedAttachments.shouldShowGroupHeadings ? (
            <div
              data-testid={`workflow-inspector-attachment-group-label-item-${group.itemIndex + 1}`}
              style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.35, textTransform: "uppercase", color: "#475569" }}
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
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
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
                  style={{ maxWidth: "100%", maxHeight: 260, objectFit: "contain", background: "#f8fafc", border: "1px solid #e5e7eb" }}
                />
              ) : null}
              {entry.attachment.previewKind === "audio" ? (
                <audio data-testid={`workflow-inspector-audio-preview-${entry.attachment.id}`} controls src={entry.contentUrl} />
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



export function WorkflowInspectorBinaryView(args: Readonly<{ attachments: ReadonlyArray<WorkflowExecutionInspectorAttachmentModel>; emptyLabel: string }>) {
  if (args.attachments.length === 0) {
    return <div data-testid="workflow-inspector-empty-state" style={{ opacity: 0.62, fontSize: 13 }}>{args.emptyLabel}</div>;
  }
  return <WorkflowInspectorAttachmentList attachments={args.attachments} />;
}



export function WorkflowInspectorPrettyView(args: Readonly<{ value: unknown; emptyLabel: string }>) {
  const { value, emptyLabel } = args;
  const treeData = useMemo(() => WorkflowInspectorPrettyTreePresenter.buildTreeData(value), [value]);
  const allExpandedKeys = useMemo(() => WorkflowInspectorPrettyTreePresenter.collectKeys(treeData), [treeData]);
  const [expandedKeys, setExpandedKeys] = useState<ReadonlyArray<string>>([]);
  const expandedKeySet = useMemo(() => new Set(expandedKeys), [expandedKeys]);

  useEffect(() => {
    setExpandedKeys(allExpandedKeys);
  }, [allExpandedKeys]);

  if (value === undefined) {
    return <div data-testid="workflow-inspector-empty-state" style={{ opacity: 0.62, fontSize: 13 }}>{emptyLabel}</div>;
  }

  return (
    <div style={{ height: "100%", minHeight: 0, display: "grid", gridTemplateRows: "auto 1fr", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button onClick={() => setExpandedKeys([])} style={{ border: "1px solid #d1d5db", background: "white", padding: "6px 10px", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>
            Collapse all
          </button>
          <button onClick={() => setExpandedKeys(allExpandedKeys)} style={{ border: "1px solid #d1d5db", background: "white", padding: "6px 10px", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>
            Expand all
          </button>
        </div>
        <div data-testid="workflow-inspector-pretty-hint" style={{ fontSize: 12, opacity: 0.65 }}>
          Readable tree view with preserved line breaks
        </div>
      </div>
      <div style={{ minWidth: 0, overflowX: "hidden", overflowY: "auto", border: "1px solid #d1d5db", background: "#f8fafc", padding: 12 }}>
        <div data-testid="workflow-inspector-pretty-tree">
          {WorkflowInspectorPrettyTreeViewRenderer.renderNodes(treeData, expandedKeySet, (key) => {
            setExpandedKeys((current) => (current.includes(key) ? current.filter((entry) => entry !== key) : [...current, key]));
          })}
        </div>
      </div>
    </div>
  );
}



export function WorkflowInspectorErrorView(args: Readonly<{ error: NodeExecutionError | undefined; emptyLabel: string; getErrorHeadline: (error: NodeExecutionError | undefined) => string; getErrorStack: (error: NodeExecutionError | undefined) => string | null; getErrorClipboardText: (error: NodeExecutionError | undefined) => string }>) {
  const { error, emptyLabel, getErrorClipboardText, getErrorHeadline, getErrorStack } = args;
  const [copyState, setCopyState] = useState<CopyState>("idle");

  if (!error) {
    return <div data-testid="workflow-inspector-empty-state" style={{ opacity: 0.62, fontSize: 13 }}>{emptyLabel}</div>;
  }

  const headline = getErrorHeadline(error);
  const stack = getErrorStack(error);

  return (
    <div style={{ height: "100%", minHeight: 0, display: "grid", gridTemplateRows: "auto auto 1fr", gap: 10 }}>
      <div style={{ display: "grid", gap: 8, border: "1px solid #fecaca", background: "#fef2f2", padding: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.45, textTransform: "uppercase", color: "#991b1b" }}>Error</div>
        <div
          data-testid="workflow-inspector-error-headline"
          style={{ fontSize: 13, lineHeight: 1.55, color: "#111827", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}
        >
          {headline}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div style={{ fontSize: 12, color: "#4b5563" }}>{stack ? "Full stacktrace" : "No stacktrace was captured for this error."}</div>
        <button
          onClick={() => {
            const value = getErrorClipboardText(error);
            if (!value) return;
            void navigator.clipboard.writeText(value).then(() => {
              setCopyState("copied");
              window.setTimeout(() => setCopyState("idle"), 1500);
            });
          }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            border: "1px solid #d1d5db",
            background: "white",
            padding: "6px 10px",
            cursor: "pointer",
            fontWeight: 700,
            fontSize: 12,
            color: "#111827",
          }}
        >
          {copyState === "copied" ? <Check size={14} strokeWidth={2.2} /> : <Copy size={14} strokeWidth={2.2} />}
          {copyState === "copied" ? "Copied" : "Copy stacktrace"}
        </button>
      </div>
      <div style={{ minWidth: 0, overflowX: "hidden", overflowY: "auto", border: "1px solid #d1d5db", background: "#0f172a", color: "#e2e8f0", padding: 12 }}>
        <pre style={{ margin: 0, fontSize: 12, lineHeight: 1.65, whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
          {stack ?? headline}
        </pre>
      </div>
    </div>
  );
}

