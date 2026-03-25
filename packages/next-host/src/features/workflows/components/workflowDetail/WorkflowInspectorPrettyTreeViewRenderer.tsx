import { ChevronRight } from "lucide-react";

import type { ReactNode } from "react";

import type { PrettyJsonTreeNode } from "../../lib/workflowDetail/workflowDetailTypes";

export class WorkflowInspectorPrettyTreeViewRenderer {
  private static readonly INDENT_PX = 18;

  static renderNodes(
    nodes: ReadonlyArray<PrettyJsonTreeNode>,
    expandedKeys: ReadonlySet<string>,
    onToggle: (key: string) => void,
    depth = 0,
  ): ReactNode {
    return (
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {nodes.map((node) => (
          <li key={node.key} style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {node.isLeaf
              ? this.renderLeafNode(node, depth)
              : this.renderBranchNode(node, expandedKeys, onToggle, depth)}
          </li>
        ))}
      </ul>
    );
  }

  private static renderBranchNode(
    node: PrettyJsonTreeNode,
    expandedKeys: ReadonlySet<string>,
    onToggle: (key: string) => void,
    depth: number,
  ): ReactNode {
    const isExpanded = expandedKeys.has(node.key);
    const children = node.children ?? [];
    return (
      <div data-testid={`pretty-json-branch-${node.key}`} style={{ display: "grid", gap: 4 }}>
        <div
          data-testid={`pretty-json-row-${node.key}`}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            minWidth: 0,
            padding: "4px 0",
            paddingLeft: depth * this.INDENT_PX,
          }}
        >
          <button
            type="button"
            data-testid={`pretty-json-toggle-${node.key}`}
            aria-expanded={isExpanded}
            onClick={() => onToggle(node.key)}
            style={{
              border: "none",
              background: "transparent",
              padding: 0,
              margin: 0,
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 800,
              color: "#0f172a",
              textAlign: "left",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <ChevronRight
              size={13}
              strokeWidth={2.2}
              style={{
                color: "#64748b",
                transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                transition: "transform 120ms ease",
                flex: "0 0 auto",
              }}
            />
            {node.label}
          </button>
        </div>
        {isExpanded && children.length > 0 ? this.renderNodes(children, expandedKeys, onToggle, depth + 1) : null}
      </div>
    );
  }

  private static renderLeafNode(node: PrettyJsonTreeNode, depth: number): ReactNode {
    return (
      <div
        data-testid={`pretty-json-leaf-${node.key}`}
        style={{
          display: "grid",
          gap: node.multilineValue ? 6 : 0,
          padding: "4px 0",
        }}
      >
        <div
          data-testid={`pretty-json-row-${node.key}`}
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
            minWidth: 0,
            flexWrap: "wrap",
            paddingLeft: depth * this.INDENT_PX,
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 800, color: "#0f172a" }}>{node.label}</span>
          {node.multilineValue ? (
            <span
              style={{
                border: "1px solid #bfdbfe",
                background: "#eff6ff",
                color: "#1d4ed8",
                fontSize: 11,
                fontWeight: 700,
                padding: "1px 6px",
              }}
            >
              multiline string
            </span>
          ) : (
            node.inlineValue
          )}
        </div>
        {node.multilineValue ? (
          <div
            data-testid={`pretty-json-multiline-${node.key}`}
            style={{
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              border: "1px solid #dbeafe",
              background: "#ffffff",
              color: "#0f172a",
              padding: "8px 10px",
              marginLeft: depth * this.INDENT_PX,
              lineHeight: 1.6,
            }}
          >
            {node.multilineValue}
          </div>
        ) : null}
      </div>
    );
  }
}
