import Bot from "lucide-react/dist/esm/icons/bot";
import Boxes from "lucide-react/dist/esm/icons/boxes";
import Braces from "lucide-react/dist/esm/icons/braces";
import Building2 from "lucide-react/dist/esm/icons/building-2";
import CheckCircle from "lucide-react/dist/esm/icons/check-circle";
import CircleDashed from "lucide-react/dist/esm/icons/circle-dashed";
import CircleHelp from "lucide-react/dist/esm/icons/circle-help";
import Database from "lucide-react/dist/esm/icons/database";
import ExternalLink from "lucide-react/dist/esm/icons/external-link";
import FileText from "lucide-react/dist/esm/icons/file-text";
import Filter from "lucide-react/dist/esm/icons/filter";
import FlaskConical from "lucide-react/dist/esm/icons/flask-conical";
import FolderInput from "lucide-react/dist/esm/icons/folder-input";
import GitBranchPlus from "lucide-react/dist/esm/icons/git-branch-plus";
import GitMerge from "lucide-react/dist/esm/icons/git-merge";
import Globe from "lucide-react/dist/esm/icons/globe";
import Hourglass from "lucide-react/dist/esm/icons/hourglass";
import Info from "lucide-react/dist/esm/icons/info";
import Layers from "lucide-react/dist/esm/icons/layers";
import ListChecks from "lucide-react/dist/esm/icons/list-checks";
import Mail from "lucide-react/dist/esm/icons/mail";
import MailOpen from "lucide-react/dist/esm/icons/mail-open";
import Merge from "lucide-react/dist/esm/icons/merge";
import MessageSquare from "lucide-react/dist/esm/icons/message-square";
import Paperclip from "lucide-react/dist/esm/icons/paperclip";
import Play from "lucide-react/dist/esm/icons/play";
import Receipt from "lucide-react/dist/esm/icons/receipt";
import ScanText from "lucide-react/dist/esm/icons/scan-text";
import ShoppingCart from "lucide-react/dist/esm/icons/shopping-cart";
import Split from "lucide-react/dist/esm/icons/split";
import SquarePen from "lucide-react/dist/esm/icons/square-pen";
import Tag from "lucide-react/dist/esm/icons/tag";
import Truck from "lucide-react/dist/esm/icons/truck";
import Ungroup from "lucide-react/dist/esm/icons/ungroup";
import UserCheck from "lucide-react/dist/esm/icons/user-check";
import UserPlus from "lucide-react/dist/esm/icons/user-plus";
import UserSearch from "lucide-react/dist/esm/icons/user-search";
import Webhook from "lucide-react/dist/esm/icons/webhook";
import Workflow from "lucide-react/dist/esm/icons/workflow";

import type { ComponentType, SVGProps } from "react";

type LucideIconComponent = ComponentType<
  SVGProps<SVGSVGElement> & { size?: number | string; strokeWidth?: number | string }
>;

/**
 * Curated registry of lucide icons available via `icon: "lucide:<name>"` in workflow node configs.
 *
 * Covers the icons used by codemation's core node plugins **and** a curated set of common
 * semantic icons (mail, database, paperclip, user-*, file-text, …) that consumer projects
 * routinely reach for when iconing their custom nodes. New entries are cheap; submit a PR
 * if you need an icon not in this list. Plugin authors with brand-specific icons should
 * still prefer `builtin:` / `si:` / URL.
 *
 * Why curated: lucide-react/dynamic loads icons by string at runtime, which makes Webpack/Turbopack
 * bundle ALL 1,713 icon files (1.8 MB). With this static registry we ship only what's used.
 */
export class WorkflowCanvasLucideIconRegistry {
  private static readonly icons: Readonly<Record<string, LucideIconComponent>> = {
    bot: Bot,
    boxes: Boxes,
    braces: Braces,
    "building-2": Building2,
    "check-circle": CheckCircle,
    "circle-dashed": CircleDashed,
    "circle-help": CircleHelp,
    database: Database,
    "external-link": ExternalLink,
    "file-text": FileText,
    filter: Filter,
    "flask-conical": FlaskConical,
    "folder-input": FolderInput,
    "git-branch-plus": GitBranchPlus,
    "git-merge": GitMerge,
    globe: Globe,
    hourglass: Hourglass,
    info: Info,
    layers: Layers,
    "list-checks": ListChecks,
    mail: Mail,
    "mail-open": MailOpen,
    merge: Merge,
    "message-square": MessageSquare,
    paperclip: Paperclip,
    play: Play,
    receipt: Receipt,
    "scan-text": ScanText,
    "shopping-cart": ShoppingCart,
    split: Split,
    "square-pen": SquarePen,
    tag: Tag,
    truck: Truck,
    ungroup: Ungroup,
    "user-check": UserCheck,
    "user-plus": UserPlus,
    "user-search": UserSearch,
    webhook: Webhook,
    workflow: Workflow,
  };

  private static readonly warnedUnknown = new Set<string>();

  static resolve(kebabName: string): LucideIconComponent | null {
    const icon = WorkflowCanvasLucideIconRegistry.icons[kebabName];
    if (icon) return icon;
    if (!WorkflowCanvasLucideIconRegistry.warnedUnknown.has(kebabName)) {
      WorkflowCanvasLucideIconRegistry.warnedUnknown.add(kebabName);
      console.warn(
        `[codemation] Unknown lucide icon "${kebabName}" — extend the curated registry or use the builtin: / si: / URL icon tokens.`,
      );
    }
    return null;
  }
}
