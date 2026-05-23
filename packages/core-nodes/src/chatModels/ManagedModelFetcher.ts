import type { ManagedModelDto } from "./CodemationChatModelConfig";

/**
 * Fetches the active platform-managed model allowlist from the CP.
 * Reads CONTROL_PLANE_URL from the workspace process env.
 * Returns an empty array if the env var is absent or the fetch fails.
 * Cache the result per session — the allowlist changes infrequently.
 */
export class ManagedModelFetcher {
  async fetch(): Promise<ManagedModelDto[]> {
    // eslint-disable-next-line no-restricted-properties -- CONTROL_PLANE_URL is injected by the provisioner; this class is the justified boundary.
    const cpUrl = process.env["CONTROL_PLANE_URL"];
    if (!cpUrl) return [];

    try {
      const res = await globalThis.fetch(`${cpUrl}/api/llm/managed-models`);
      if (!res.ok) return [];
      return (await res.json()) as ManagedModelDto[];
    } catch {
      return [];
    }
  }
}
