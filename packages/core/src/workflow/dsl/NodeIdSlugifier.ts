/**
 * Converts a human-readable node label into a stable, URL-safe identifier segment.
 *
 * Rules:
 * - Lowercase the entire string.
 * - Replace every run of characters outside `[a-z0-9]` with a single `-`.
 * - Strip any leading or trailing `-` characters.
 * - Return `""` for blank/empty input.
 */
export const NodeIdSlugifier = {
  slugify(label: string): string {
    if (!label) return "";
    return label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  },
};
