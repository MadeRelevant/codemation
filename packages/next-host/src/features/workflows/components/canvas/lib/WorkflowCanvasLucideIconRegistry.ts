import Bot from "lucide-react/dist/esm/icons/bot";
import Boxes from "lucide-react/dist/esm/icons/boxes";
import Braces from "lucide-react/dist/esm/icons/braces";
import CheckCircle from "lucide-react/dist/esm/icons/check-circle";
import CircleDashed from "lucide-react/dist/esm/icons/circle-dashed";
import CircleHelp from "lucide-react/dist/esm/icons/circle-help";
import ExternalLink from "lucide-react/dist/esm/icons/external-link";
import Filter from "lucide-react/dist/esm/icons/filter";
import FlaskConical from "lucide-react/dist/esm/icons/flask-conical";
import GitBranchPlus from "lucide-react/dist/esm/icons/git-branch-plus";
import GitMerge from "lucide-react/dist/esm/icons/git-merge";
import Globe from "lucide-react/dist/esm/icons/globe";
import Hourglass from "lucide-react/dist/esm/icons/hourglass";
import Info from "lucide-react/dist/esm/icons/info";
import Layers from "lucide-react/dist/esm/icons/layers";
import Merge from "lucide-react/dist/esm/icons/merge";
import Play from "lucide-react/dist/esm/icons/play";
import Split from "lucide-react/dist/esm/icons/split";
import SquarePen from "lucide-react/dist/esm/icons/square-pen";
import Ungroup from "lucide-react/dist/esm/icons/ungroup";
import Webhook from "lucide-react/dist/esm/icons/webhook";
import Workflow from "lucide-react/dist/esm/icons/workflow";

import type { ComponentType, SVGProps } from "react";

type LucideIconComponent = ComponentType<
  SVGProps<SVGSVGElement> & { size?: number | string; strokeWidth?: number | string }
>;

/**
 * Curated registry of lucide icons used by codemation's core node plugins. Hits this path
 * synchronously: zero HTTP, zero flicker, deep ESM imports tree-shake at build time.
 *
 * Consumer-supplied lucide names (e.g. `lucide:mail` set on a custom node) that aren't
 * in this list fall through to `WorkflowCanvasLucideRemoteGlyph`, which renders the SVG
 * via the server-side `/api/lucide-icon/<name>.svg` route + CSS `mask-image`. That keeps
 * the full lucide set out of the client bundle (commit ddaa265f) while giving consumers
 * any of lucide's 1,700+ glyphs without a framework PR.
 *
 * Why this set is curated, not built dynamically: any client-side `import()` with a
 * template prefix (e.g. ``import(`lucide-react/dist/esm/icons/${name}.js`)``) makes
 * Webpack/Turbopack fan out into a context chunk over the whole prefix and bundle every
 * matching file (1.8 MB / OOM during dev compile). Static deep imports here, server-side
 * file read in the route handler — never the bundler-context fan-out.
 */
export class WorkflowCanvasLucideIconRegistry {
  private static readonly icons: Readonly<Record<string, LucideIconComponent>> = {
    bot: Bot,
    boxes: Boxes,
    braces: Braces,
    "check-circle": CheckCircle,
    "circle-dashed": CircleDashed,
    "circle-help": CircleHelp,
    "external-link": ExternalLink,
    filter: Filter,
    "flask-conical": FlaskConical,
    "git-branch-plus": GitBranchPlus,
    "git-merge": GitMerge,
    globe: Globe,
    hourglass: Hourglass,
    info: Info,
    layers: Layers,
    merge: Merge,
    play: Play,
    split: Split,
    "square-pen": SquarePen,
    ungroup: Ungroup,
    webhook: Webhook,
    workflow: Workflow,
  };

  static has(kebabName: string): boolean {
    return Object.prototype.hasOwnProperty.call(WorkflowCanvasLucideIconRegistry.icons, kebabName);
  }

  static resolve(kebabName: string): LucideIconComponent | null {
    return WorkflowCanvasLucideIconRegistry.icons[kebabName] ?? null;
  }
}
