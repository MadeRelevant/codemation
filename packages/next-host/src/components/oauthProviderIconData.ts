import type { SimpleIcon } from "simple-icons";

import { siDotnet, siGithub, siOpenid } from "simple-icons";

/**
 * Maps Better Auth social provider ids to Simple Icons data.
 * Unknown ids fall back to OpenID for custom OIDC providers.
 */
export const NEXT_AUTH_PROVIDER_ICONS: Readonly<Record<string, SimpleIcon>> = {
  github: siGithub,
  microsoft: siDotnet,
  "azure-ad": siDotnet,
};

export function simpleIconForProvider(providerId: string): SimpleIcon {
  return NEXT_AUTH_PROVIDER_ICONS[providerId] ?? siOpenid;
}
