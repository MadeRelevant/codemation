import type { SimpleIcon } from "simple-icons";
import { siGmail } from "simple-icons";

/**
 * Cherry-picked Simple Icons for canvas use. Add named imports here when authors use `si:<slug>`.
 * Prefer **builtin** assets ({@link WorkflowCanvasBuiltinIconRegistry}) for brands with official marks;
 * use `si:` only when the icon is in `simple-icons` and not duplicated as a builtin.
 * Authors may also set `icon` to an image URL for any brand not listed.
 */
export class WorkflowCanvasSiIconRegistry {
  private static readonly slugToIcon: ReadonlyMap<string, SimpleIcon> = new Map<string, SimpleIcon>([
    ["gmail", siGmail],
  ]);

  static resolve(slug: string): SimpleIcon | undefined {
    return this.slugToIcon.get(slug);
  }
}
