/**
 * Lightweight boot-phase timer. Designed for diagnosing slow `pnpm dev` cold starts.
 *
 * Usage: every meaningful boot phase wraps its async work in
 *   `await BootTimer.measureAsync("phase.name", async () => { ... })`
 * (or the sync `measure` for non-async work). When `--trace-boot` is set on the CLI
 * the timer records each phase in a tree, prints a pretty tree to stderr at the end
 * of boot, and writes the same tree to `tmp/boot-trace.json` for diffing later.
 *
 * When disabled (default), every method is a near-zero-cost passthrough — no allocation,
 * no Date.now() calls, no tree construction. Safe to leave instrumentation in production
 * code paths.
 */

import { promises as fs } from "node:fs";
import path from "node:path";

type PhaseNode = {
  name: string;
  startNs: bigint;
  endNs: bigint | null;
  children: PhaseNode[];
  parent: PhaseNode | null;
};

export type BootTracePhase = Readonly<{
  name: string;
  ms: number;
  pct: number;
  children: ReadonlyArray<BootTracePhase>;
}>;

export class BootTimer {
  private static enabled = false;
  private static root: PhaseNode | null = null;
  private static current: PhaseNode | null = null;

  /** Enable boot tracing for the lifetime of the current process. Idempotent. */
  static enable(): void {
    if (this.enabled) return;
    this.enabled = true;
    this.root = { name: "boot", startNs: process.hrtime.bigint(), endNs: null, children: [], parent: null };
    this.current = this.root;
  }

  static isEnabled(): boolean {
    return this.enabled;
  }

  /** Wrap an async phase. Pass-through when disabled. */
  static async measureAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {
    if (!this.enabled || !this.current) {
      return await fn();
    }
    const node = this.pushPhase(name);
    try {
      return await fn();
    } finally {
      this.popPhase(node);
    }
  }

  /** Wrap a sync phase. Pass-through when disabled. */
  static measure<T>(name: string, fn: () => T): T {
    if (!this.enabled || !this.current) {
      return fn();
    }
    const node = this.pushPhase(name);
    try {
      return fn();
    } finally {
      this.popPhase(node);
    }
  }

  /**
   * Manual start/stop for fire-and-forget phases (e.g. a spawned child process you only
   * stop once a readiness probe succeeds). Returns the stop function.
   */
  static start(name: string): () => void {
    if (!this.enabled || !this.current) {
      return () => {};
    }
    const node = this.pushPhase(name);
    return () => this.popPhase(node);
  }

  /** Print the tree to stderr and write JSON to the given path. Finalizes the root span. */
  static async finish(outputJsonPath?: string): Promise<void> {
    if (!this.enabled || !this.root) return;
    if (this.root.endNs === null) {
      this.root.endNs = process.hrtime.bigint();
    }
    const totalMs = nodeMs(this.root);
    process.stderr.write(`\n=== Boot trace (total ${totalMs.toFixed(0)}ms) ===\n`);
    writeTree(this.root, 0, totalMs);
    process.stderr.write("=========================================\n\n");
    if (outputJsonPath) {
      try {
        await fs.mkdir(path.dirname(outputJsonPath), { recursive: true });
        await fs.writeFile(outputJsonPath, JSON.stringify(this.snapshot(), null, 2), "utf8");
      } catch (error) {
        process.stderr.write(`[boot-timer] failed to write JSON trace: ${String(error)}\n`);
      }
    }
  }

  /** Return a plain-object snapshot of the current tree (for tests / diffing). */
  static snapshot(): BootTracePhase {
    if (!this.root) {
      return { name: "boot", ms: 0, pct: 100, children: [] };
    }
    const totalMs = nodeMs(this.root);
    return toReport(this.root, totalMs);
  }

  /** Test helper: reset all state. Do not call in production code. */
  static reset(): void {
    this.enabled = false;
    this.root = null;
    this.current = null;
  }

  private static pushPhase(name: string): PhaseNode {
    const node: PhaseNode = {
      name,
      startNs: process.hrtime.bigint(),
      endNs: null,
      children: [],
      parent: this.current,
    };
    this.current!.children.push(node);
    this.current = node;
    return node;
  }

  private static popPhase(node: PhaseNode): void {
    node.endNs = process.hrtime.bigint();
    this.current = node.parent ?? this.root;
  }
}

function nodeMs(node: PhaseNode): number {
  const end = node.endNs ?? node.startNs;
  return Number(end - node.startNs) / 1e6;
}

function toReport(node: PhaseNode, totalMs: number): BootTracePhase {
  const ms = nodeMs(node);
  return {
    name: node.name,
    ms,
    pct: totalMs > 0 ? (ms / totalMs) * 100 : 0,
    children: node.children.map((child) => toReport(child, totalMs)),
  };
}

function writeTree(node: PhaseNode, depth: number, totalMs: number): void {
  const ms = nodeMs(node);
  const pct = totalMs > 0 ? ((ms / totalMs) * 100).toFixed(1) : "—";
  const indent = "  ".repeat(depth);
  const msStr = ms.toFixed(0).padStart(6);
  const pctStr = pct.padStart(5);
  process.stderr.write(`${indent}${msStr}ms  ${pctStr}%  ${node.name}\n`);
  for (const child of node.children) {
    writeTree(child, depth + 1, totalMs);
  }
}
