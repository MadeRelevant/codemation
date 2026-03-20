import type { ReactNode } from "react";

import type { PrettyJsonTreeNode } from "./workflowDetailTypes";

export class WorkflowInspectorPrettyTreePresenter {
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
