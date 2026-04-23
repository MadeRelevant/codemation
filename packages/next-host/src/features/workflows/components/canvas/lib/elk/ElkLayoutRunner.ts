import ElkConstructor, { type ELK, type ElkNode } from "elkjs/lib/elk.bundled.js";

/**
 * Thin wrapper around an `elkjs` instance. Separated so the async graph-layout
 * call is mockable via DI at the test seam (`WorkflowElkGraphBuilder` produces
 * a graph, this class runs the layout, `WorkflowElkResultMapper` consumes the
 * positioned result).
 *
 * Uses the bundled (no web worker) build so it runs identically in jsdom
 * tests, Node, and the browser.
 */
export class ElkLayoutRunner {
  private static sharedInstance: ELK | null = null;

  private static elk(): ELK {
    if (this.sharedInstance === null) {
      this.sharedInstance = new ElkConstructor();
    }
    return this.sharedInstance;
  }

  static async layout(graph: ElkNode): Promise<ElkNode> {
    return this.elk().layout(graph);
  }
}
