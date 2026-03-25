/**
 * Post-layout pass that removes axis-aligned overlaps between workflow nodes.
 * Dagre (layered Sugiyama-style) provides the primary structure; this resolver
 * nudges centers so bounding boxes never intersect—important when attachment
 * nodes sit under parents or when manual offsets interact with dense graphs.
 */
export class WorkflowCanvasOverlapResolver {
  static resolve(
    args: Readonly<{
      positionsByNodeId: ReadonlyMap<string, { x: number; y: number }>;
      widthByNodeId: ReadonlyMap<string, number>;
      heightByNodeId: ReadonlyMap<string, number>;
      gap: number;
      maxIterations?: number;
    }>,
  ): Map<string, { x: number; y: number }> {
    const maxIterations = args.maxIterations ?? 160;
    const gap = args.gap;
    const out = new Map<string, { x: number; y: number }>();
    for (const [id, p] of args.positionsByNodeId) {
      out.set(id, { x: p.x, y: p.y });
    }
    const ids = [...out.keys()].sort();
    for (let iter = 0; iter < maxIterations; iter++) {
      let moved = false;
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const idA = ids[i];
          const idB = ids[j];
          if (idA === undefined || idB === undefined) continue;
          const pa = out.get(idA);
          const pb = out.get(idB);
          if (!pa || !pb) continue;
          const wa = args.widthByNodeId.get(idA) ?? 0;
          const ha = args.heightByNodeId.get(idA) ?? 0;
          const wb = args.widthByNodeId.get(idB) ?? 0;
          const hb = args.heightByNodeId.get(idB) ?? 0;
          const minDx = (wa + wb) / 2 + gap;
          const minDy = (ha + hb) / 2 + gap;
          const dx = Math.abs(pa.x - pb.x);
          const dy = Math.abs(pa.y - pb.y);
          if (dx >= minDx || dy >= minDy) {
            continue;
          }
          const overlapX = minDx - dx;
          const overlapY = minDy - dy;
          const moveId = idA > idB ? idA : idB;
          const pm = out.get(moveId);
          const otherId = moveId === idA ? idB : idA;
          const po = out.get(otherId);
          if (!pm || !po) continue;
          const wm = moveId === idA ? wa : wb;
          const hm = moveId === idA ? ha : hb;
          const wo = moveId === idA ? wb : wa;
          const ho = moveId === idA ? hb : ha;
          const pairMinDx = (wm + wo) / 2 + gap;
          const pairMinDy = (hm + ho) / 2 + gap;
          if (overlapY <= overlapX) {
            if (pm.y <= po.y) {
              out.set(moveId, { x: pm.x, y: po.y - pairMinDy });
            } else {
              out.set(moveId, { x: pm.x, y: po.y + pairMinDy });
            }
          } else if (pm.x <= po.x) {
            out.set(moveId, { x: po.x - pairMinDx, y: pm.y });
          } else {
            out.set(moveId, { x: po.x + pairMinDx, y: pm.y });
          }
          moved = true;
        }
      }
      if (!moved) {
        break;
      }
    }
    return out;
  }
}
