import type { SimpleIcon } from "simple-icons";

import { siDotnet, siGithub, siOpenid } from "simple-icons";

/**
 * Maps Auth.js / NextAuth provider `id` to Simple Icons data.
 * Unknown ids fall back to OpenID for custom OIDC providers.
 */
export const NEXT_AUTH_PROVIDER_ICONS: Readonly<Record<string, SimpleIcon>> = {
  github: siGithub,
  "microsoft-entra-id": siDotnet,
  "azure-ad": siDotnet,
};

export function simpleIconForProvider(providerId: string): SimpleIcon {
  return NEXT_AUTH_PROVIDER_ICONS[providerId] ?? siOpenid;
}
