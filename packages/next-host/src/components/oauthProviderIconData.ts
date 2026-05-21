/**
 * Maps Better Auth social provider ids to Simple Icons SVG data.
 * Unknown ids fall back to an OpenID glyph.
 *
 * Inline data instead of named imports from the `simple-icons` barrel: the barrel is a
 * single ~5.2 MB CJS file containing all 3000+ brand paths. Even with
 * `optimizePackageImports`, Turbopack must parse the whole file on first compile.
 * These three icons are the only ones needed here, so we inline their path+hex directly.
 *
 * Values sourced from simple-icons@16.12.0 (update when bumping the package).
 */

type SiIconData = Readonly<{ path: string; hex: string }>;

/** GitHub — simple-icons@16.12.0 */
const SI_GITHUB: SiIconData = {
  path: "M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12",
  hex: "181717",
};

/** .NET (Microsoft) — simple-icons@16.12.0 */
const SI_DOTNET: SiIconData = {
  path: "M24 8.77h-2.468v7.565h-1.425V8.77h-2.462V7.53H24zm-6.852 7.565h-4.821V7.53h4.63v1.24h-3.205v2.494h2.953v1.234h-2.953v2.604h3.396zm-6.708 0H8.882L5.79 9.863a3 3 0 0 1-.255-.611h-.035c.028.218.042.646.042 1.283v5.8H4.156V7.53H5.72l2.99 6.386q.248.532.34.728h.023c-.033-.268-.05-.696-.05-1.284V7.529h1.417zm-9.22-.892a.59.59 0 0 1-.59.59.59.59 0 0 1-.59-.59.59.59 0 0 1 .59-.59.59.59 0 0 1 .59.59",
  hex: "512BD4",
};

/** OpenID — simple-icons@16.12.0 */
const SI_OPENID: SiIconData = {
  path: "M11.593 1.099c-.662.083-1.29.304-1.91.617v15.58l3.54-1.638V12.43c.572.28 1.166.449 1.783.449 2.401 0 4.35-2.038 4.35-4.551 0-2.512-1.949-4.55-4.35-4.55-.47 0-.928.085-1.36.237A5.6 5.6 0 0 0 12 3.898v-.022l-.407-.024zm.407 4.56c.13-.049.265-.075.405-.075.705 0 1.275.682 1.275 1.523 0 .84-.57 1.522-1.275 1.522-.14 0-.275-.027-.405-.074zm-3.546-2.52C3.778 4.473 0 7.37 0 11.028c0 3.481 3.458 6.283 7.956 6.726l.498-.23V14.67c-2.588-.34-4.499-2.044-4.499-4.044 0-2.166 2.196-3.964 5.003-4.218l.496-.23z",
  hex: "F78C40",
};

const PROVIDER_ICON_MAP: Record<string, SiIconData> = {
  github: SI_GITHUB,
  microsoft: SI_DOTNET,
  "azure-ad": SI_DOTNET,
};

export function simpleIconForProvider(providerId: string): SiIconData {
  return PROVIDER_ICON_MAP[providerId] ?? SI_OPENID;
}
