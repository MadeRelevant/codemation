import type { ElkNode, ElkPort } from "elkjs/lib/elk.bundled.js";

import type { WorkflowDto, WorkflowEdgeDto, WorkflowNodeDto } from "../../../../lib/realtime/workflowTypes";
import { WORKFLOW_CANVAS_MAIN_NODE_CARD_PX, WorkflowCanvasNodeGeometry } from "../workflowCanvasNodeGeometry";
import type { WorkflowElkNodeSizing } from "./WorkflowElkNodeSizingResolver";
import type { WorkflowElkPortInfo } from "./WorkflowElkPortInfoResolver";

const LAYOUT_SPACING_NODE_NODE_PX = 45;
/**
 * Horizontal gap ELK enforces between consecutive **layers** on the root graph.
 *
 * This has to comfortably clear the widest possible compound neighbor: an agent
 * that owns multiple nested-agent compounds is often several hundred pixels
 * wide, and ELK measures "layer to layer" from the outer bounding boxes. A
 * smaller value (we were using 128 while iterating) made post-compound main
 * nodes (for example "Prepare Odoo sale order" right after "Extract RFQ
 * domain") feel glued to the parent's dashed border. The current value
 * (~20% tighter than the previous 224px) still clears compound borders
 * comfortably while giving the canvas a less airy feel overall.
 */
const LAYOUT_SPACING_BETWEEN_LAYERS_PX = 180;
const LAYOUT_SPACING_EDGE_NODE_PX = 24;

/** Extra vertical breathing room between the parent agent's LLM/TOOLS chip row and the first attachment row. */
const COMPOUND_ATTACHMENT_BREATHING_PX = 24;
/** Fixed side/bottom padding inside a compound node. */
const COMPOUND_SIDE_PADDING_PX = 20;
/** Horizontal + vertical spacing between sibling attachment nodes inside a compound. */
const COMPOUND_SIBLING_SPACING_PX = 72;
/**
 * Target aspect ratio (width / height) for the `box` packing of an agent
 * compound's children.
 *
 * Root agents use a wide ratio so their LLM + tools + nested agents sit
 * in a single readable row below the parent card. Nested agents use a
 * moderately wide ratio so the common case — one LLM + one tool —
 * places the two children **side-by-side** (LLM on the left, tool on
 * the right), matching the LLM / Tools chip slots on the card above
 * them. Children still stack into a second row when the compound has
 * three or more children, keeping the outer parent narrow enough to
 * avoid the previous "Extract RFQ is too wide" failure mode.
 *
 * Children's exact X coordinates do not have to line up perfectly with
 * the card's fixed LLM / Tools handle slots — the dashed attachment
 * edges are rendered with React Flow's `smoothstep`, so a small bend is
 * expected and actually helps distinguish attachment lines from the
 * straight-ish main-chain routing above.
 */
const ROOT_COMPOUND_CHILDREN_ASPECT_RATIO = 2.6;
const NESTED_COMPOUND_CHILDREN_ASPECT_RATIO = 2.0;

/**
 * ELK port IDs encode the owning node and the logical port name so the mapper
 * can decode them back to React Flow handle IDs without maintaining a parallel
 * lookup table.
 */
const PORT_ID_SEPARATOR = "::";

export type WorkflowElkBuilderInput = Readonly<{
  workflow: WorkflowDto;
  portInfoByNodeId: ReadonlyMap<string, WorkflowElkPortInfo>;
  sizingByNodeId: ReadonlyMap<string, WorkflowElkNodeSizing>;
}>;

/**
 * Translates a `WorkflowDto` into an ELK graph.
 *
 * Agent-style parents become ELK compound nodes whose `children` are the
 * agent's LLM / tool / nested-agent attachment nodes. The parent→child
 * attachment edges from the workflow DTO are intentionally *not* given to ELK;
 * the compound membership (`children` array) is enough to keep them grouped,
 * and React Flow draws the visual dashed attachment edges between the rendered
 * handles on its own. This avoids having ELK route bogus edges from the
 * compound's outer SOUTH border up into its own children.
 *
 * Main-chain WEST/EAST ports are pinned with `FIXED_POS` to the vertical
 * center of the parent **card** (not the compound bounding box), so the
 * incoming/outgoing arrows land on the visible card rather than mid-air
 * below it when the compound is taller because of attachments.
 */
export class WorkflowElkGraphBuilder {
  static encodePortId(nodeId: string, portName: string): string {
    return `${nodeId}${PORT_ID_SEPARATOR}${portName}`;
  }

  static decodePortId(portId: string | undefined): Readonly<{ nodeId: string; portName: string }> | undefined {
    if (!portId) return undefined;
    const separatorIndex = portId.indexOf(PORT_ID_SEPARATOR);
    if (separatorIndex < 0) return undefined;
    return {
      nodeId: portId.slice(0, separatorIndex),
      portName: portId.slice(separatorIndex + PORT_ID_SEPARATOR.length),
    };
  }

  static build(input: WorkflowElkBuilderInput): ElkNode {
    const { workflow, portInfoByNodeId, sizingByNodeId } = input;

    const attachmentNodesByParentId = new Map<string, WorkflowNodeDto[]>();
    for (const node of workflow.nodes) {
      if (!node.parentNodeId) continue;
      const siblings = attachmentNodesByParentId.get(node.parentNodeId) ?? [];
      siblings.push(node);
      attachmentNodesByParentId.set(node.parentNodeId, siblings);
    }

    const rootLevelNodes = workflow.nodes.filter((node) => !node.parentNodeId);
    const rootLevelNodeIds = new Set(rootLevelNodes.map((node) => node.id));
    const attachmentNodeIds = new Set(
      workflow.nodes.filter((node) => Boolean(node.parentNodeId)).map((node) => node.id),
    );

    const children: ElkNode[] = rootLevelNodes.map((node) =>
      this.buildElkNode({ node, attachmentNodesByParentId, portInfoByNodeId, sizingByNodeId }),
    );

    const rootEdges = workflow.edges
      .filter((edge) => this.isMainChainEdge(edge, rootLevelNodeIds, attachmentNodeIds))
      .map((edge, index) => this.buildRootElkEdge(edge, index));

    return {
      id: "root",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": "RIGHT",
        "elk.hierarchyHandling": "INCLUDE_CHILDREN",
        "elk.spacing.nodeNode": String(LAYOUT_SPACING_NODE_NODE_PX),
        "elk.layered.spacing.nodeNodeBetweenLayers": String(LAYOUT_SPACING_BETWEEN_LAYERS_PX),
        "elk.spacing.edgeNode": String(LAYOUT_SPACING_EDGE_NODE_PX),
        // Layer assignment: LONGEST_PATH places each node at
        // `max(predecessor_layer) + 1` rather than minimising total
        // edge length. Combined with BRANDES_KOEPF/BALANCED node
        // placement below, this aligns the **terminal nodes of
        // parallel branches** into the same layer when they share a
        // downstream merge node: e.g. "RFQ path — done" (long branch)
        // and "Human path — done" (short branch) both end in the
        // layer immediately before "Validate result", so the two
        // merge edges land on Validate result's input port at
        // mirrored angles instead of one short + one long horizontal
        // dogleg. Makes the graph slightly wider in pathological
        // cases but that's the price of predictable merge geometry.
        "elk.layered.layering.strategy": "LONGEST_PATH",
        // Node placement: BRANDES_KOEPF with BALANCED alignment
        // computes four candidate alignments (top-left / top-right /
        // bottom-left / bottom-right) and averages them, which yields a
        // roughly symmetric vertical spread for fork/merge patterns —
        // an `if` node's two branches end up one above and one below
        // the fork's Y axis, and an `n`-way switch spreads branches
        // evenly on both sides of the source row instead of pinning one
        // branch as the "main line".
        "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
        "elk.layered.nodePlacement.bk.fixedAlignment": "BALANCED",
      },
      children,
      edges: rootEdges,
    };
  }

  /**
   * Keeps only edges whose endpoints are both top-level nodes. Parent→child
   * attachment edges are *not* forwarded to ELK; see class docstring.
   */
  private static isMainChainEdge(
    edge: WorkflowEdgeDto,
    rootLevelNodeIds: ReadonlySet<string>,
    attachmentNodeIds: ReadonlySet<string>,
  ): boolean {
    if (attachmentNodeIds.has(edge.to.nodeId)) return false;
    return rootLevelNodeIds.has(edge.from.nodeId) && rootLevelNodeIds.has(edge.to.nodeId);
  }

  private static buildElkNode(args: {
    node: WorkflowNodeDto;
    attachmentNodesByParentId: ReadonlyMap<string, readonly WorkflowNodeDto[]>;
    portInfoByNodeId: ReadonlyMap<string, WorkflowElkPortInfo>;
    sizingByNodeId: ReadonlyMap<string, WorkflowElkNodeSizing>;
  }): ElkNode {
    const { node, attachmentNodesByParentId, portInfoByNodeId, sizingByNodeId } = args;
    const attachmentChildren = attachmentNodesByParentId.get(node.id) ?? [];
    const hasAttachmentChildren = attachmentChildren.length > 0;
    const sizing = sizingByNodeId.get(node.id);
    const widthPx = sizing?.widthPx ?? WORKFLOW_CANVAS_MAIN_NODE_CARD_PX;
    const heightPx = sizing?.heightPx ?? WORKFLOW_CANVAS_MAIN_NODE_CARD_PX;
    const cardHeightPx = sizing?.cardHeightPx ?? WORKFLOW_CANVAS_MAIN_NODE_CARD_PX;
    const ports = this.buildMainChainPorts({ node, portInfoByNodeId, widthPx, cardHeightPx });

    if (!hasAttachmentChildren) {
      return {
        id: node.id,
        width: widthPx,
        height: heightPx,
        ports,
        layoutOptions: { "elk.portConstraints": "FIXED_POS" },
      };
    }

    const childElkNodes = attachmentChildren.map((childNode) => this.buildElkNode({ ...args, node: childNode }));
    const compoundTopPaddingPx =
      cardHeightPx + WorkflowCanvasNodeGeometry.agentShellBelowCardPx() + COMPOUND_ATTACHMENT_BREATHING_PX;
    const isNestedAgent = Boolean(node.parentNodeId);
    const aspectRatio = isNestedAgent ? NESTED_COMPOUND_CHILDREN_ASPECT_RATIO : ROOT_COMPOUND_CHILDREN_ASPECT_RATIO;

    return {
      id: node.id,
      width: widthPx,
      height: heightPx,
      ports,
      children: childElkNodes,
      layoutOptions: {
        // `box` lays out unconnected siblings as a compact rectangle —
        // perfect for the attachment row(s) (LLM / tool / nested-agent)
        // that sit below an agent card with no edges between them. The
        // aspect ratio hint tells the packer whether to prefer a wide
        // row (root agents) or a more compact block (nested agents).
        "elk.algorithm": "box",
        "elk.portConstraints": "FIXED_POS",
        // Reserve top padding for: parent card + its LLM/TOOLS chip row +
        // a breathing gap before the first attachment row. Without this
        // the chip row bleeds into the children row.
        "elk.padding": `[top=${compoundTopPaddingPx},left=${COMPOUND_SIDE_PADDING_PX},right=${COMPOUND_SIDE_PADDING_PX},bottom=${COMPOUND_SIDE_PADDING_PX}]`,
        "elk.spacing.nodeNode": String(COMPOUND_SIBLING_SPACING_PX),
        "elk.aspectRatio": String(aspectRatio),
      },
    };
  }

  /**
   * Main-chain ports only. Attachment edges are drawn by React Flow between
   * SOUTH-edge handles on the parent card and NORTH-edge handles on child
   * cards, so ELK does not need those ports.
   *
   * `FIXED_POS` pins the port to an explicit (x, y) on the node — we use that
   * to anchor WEST/EAST ports to the parent card's vertical midpoint even when
   * the compound node has extra vertical bulk from attachment children.
   */
  private static buildMainChainPorts(args: {
    node: WorkflowNodeDto;
    portInfoByNodeId: ReadonlyMap<string, WorkflowElkPortInfo>;
    widthPx: number;
    cardHeightPx: number;
  }): ElkPort[] {
    if (args.node.parentNodeId) return [];
    const info = args.portInfoByNodeId.get(args.node.id);
    const targetInputPorts = info?.targetInputPorts ?? ["in"];
    const sourceOutputPorts = info?.sourceOutputPorts ?? ["main"];
    const cardCenterY = args.cardHeightPx / 2;
    const ports: ElkPort[] = [];
    targetInputPorts.forEach((portName, index) => {
      ports.push({
        id: WorkflowElkGraphBuilder.encodePortId(args.node.id, portName),
        x: 0,
        y: cardCenterY,
        layoutOptions: {
          "elk.port.side": "WEST",
          "elk.port.index": String(index),
        },
      });
    });
    sourceOutputPorts.forEach((portName, index) => {
      ports.push({
        id: WorkflowElkGraphBuilder.encodePortId(args.node.id, portName),
        x: args.widthPx,
        y: cardCenterY,
        layoutOptions: {
          "elk.port.side": "EAST",
          "elk.port.index": String(index),
        },
      });
    });
    return ports;
  }

  private static buildRootElkEdge(edge: WorkflowEdgeDto, index: number): NonNullable<ElkNode["edges"]>[number] {
    return {
      id: `edge-${edge.from.nodeId}-${edge.from.output}-${edge.to.nodeId}-${edge.to.input}-${index}`,
      sources: [WorkflowElkGraphBuilder.encodePortId(edge.from.nodeId, edge.from.output)],
      targets: [WorkflowElkGraphBuilder.encodePortId(edge.to.nodeId, edge.to.input)],
    };
  }
}
