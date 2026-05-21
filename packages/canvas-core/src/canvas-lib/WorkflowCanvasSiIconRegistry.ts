/**
 * Cherry-picked Simple Icons for canvas use. Add slug entries here when authors use `si:<slug>`.
 * Prefer **builtin** assets ({@link WorkflowCanvasBuiltinIconRegistry}) for brands with official marks;
 * use `si:` only when the icon is in `simple-icons` and not duplicated as a builtin.
 * Authors may also set `icon` to an image URL for any brand not listed.
 *
 * Icons are served via `/api/si-icon/<slug>.svg` (server-side route reading from disk) rather than
 * importing the ~5 MB `simple-icons` barrel into the client bundle.
 */

/** Set of slugs known to exist in simple-icons for fast existence checks. */
const KNOWN_SLUGS = new Set<string>(["gmail"]);

export class WorkflowCanvasSiIconRegistry {
  /**
   * Returns the server-side URL for the given slug, or `undefined` if the slug is
   * not in the curated set.
   */
  static resolve(slug: string): string | undefined {
    if (!KNOWN_SLUGS.has(slug)) {
      return undefined;
    }
    return `/api/si-icon/${encodeURIComponent(slug)}.svg`;
  }
}
