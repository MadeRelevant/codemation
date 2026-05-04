import Bot from "lucide-react/dist/esm/icons/bot";
import Boxes from "lucide-react/dist/esm/icons/boxes";
import Braces from "lucide-react/dist/esm/icons/braces";
import CheckCircle from "lucide-react/dist/esm/icons/check-circle";
import CircleDashed from "lucide-react/dist/esm/icons/circle-dashed";
import Filter from "lucide-react/dist/esm/icons/filter";
import FlaskConical from "lucide-react/dist/esm/icons/flask-conical";
import GitBranchPlus from "lucide-react/dist/esm/icons/git-branch-plus";
import GitMerge from "lucide-react/dist/esm/icons/git-merge";
import Globe from "lucide-react/dist/esm/icons/globe";
import Hourglass from "lucide-react/dist/esm/icons/hourglass";
import Layers from "lucide-react/dist/esm/icons/layers";
import Merge from "lucide-react/dist/esm/icons/merge";
import Play from "lucide-react/dist/esm/icons/play";
import Split from "lucide-react/dist/esm/icons/split";
import SquarePen from "lucide-react/dist/esm/icons/square-pen";
import Ungroup from "lucide-react/dist/esm/icons/ungroup";
import Webhook from "lucide-react/dist/esm/icons/webhook";

import type { ComponentType, SVGProps } from "react";

type LucideIconComponent = ComponentType<
  SVGProps<SVGSVGElement> & { size?: number | string; strokeWidth?: number | string }
>;

/**
 * Curated registry of lucide icons available via `icon: "lucide:<name>"` in workflow node configs.
 *
 * Restricted to the icons used by codemation's core node plugins. Third-party plugin authors must
 * ship SVG via the `builtin:` / `si:` / URL escape hatches (see WorkflowCanvasNodeIcon docs).
 *
 * Why curated: lucide-react/dynamic loads icons by string at runtime, which makes Webpack/Turbopack
 * bundle ALL 1,713 icon files (1.8 MB). With this static registry we ship only what's used.
 */
export class WorkflowCanvasLucideIconRegistry {
  private static readonly icons: Readonly<Record<string, LucideIconComponent>> = {
    bot: Bot,
    boxes: Boxes,
    braces: Braces,
    "check-circle": CheckCircle,
    "circle-dashed": CircleDashed,
    filter: Filter,
    "flask-conical": FlaskConical,
    "git-branch-plus": GitBranchPlus,
    "git-merge": GitMerge,
    globe: Globe,
    hourglass: Hourglass,
    layers: Layers,
    merge: Merge,
    play: Play,
    split: Split,
    "square-pen": SquarePen,
    ungroup: Ungroup,
    webhook: Webhook,
  };

  private static readonly warnedUnknown = new Set<string>();

  static resolve(kebabName: string): LucideIconComponent | null {
    const icon = WorkflowCanvasLucideIconRegistry.icons[kebabName];
    if (icon) return icon;
    if (!WorkflowCanvasLucideIconRegistry.warnedUnknown.has(kebabName)) {
      WorkflowCanvasLucideIconRegistry.warnedUnknown.add(kebabName);
      console.warn(
        `[codemation] Unknown lucide icon "${kebabName}" — only icons from core node plugins are supported. Plugin authors should ship SVG via builtin: / si: / URL icon tokens.`,
      );
    }
    return null;
  }
}
