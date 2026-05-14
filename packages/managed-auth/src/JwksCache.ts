import { importJWK } from "jose";
import type { Clock, FetchFn, JwksCacheConfig } from "./types.js";

const DEFAULT_TTL_MS = 15 * 60 * 1000; // 15 minutes
const DEFAULT_JITTER_MS = 60 * 1000; // 60 seconds

type JoseKey = Awaited<ReturnType<typeof importJWK>>;

interface CacheEntry {
  keys: Map<string, JoseKey>;
  expiresAt: number;
}

interface JwkKey {
  kid?: string;
  kty?: string;
  crv?: string;
  x?: string;
  use?: string;
  alg?: string;
}

interface JwksResponse {
  keys: JwkKey[];
}

/**
 * Fetches and caches JWKS from a configured URL.
 *
 * On a `kid` cache miss the cache is refreshed once before failing —
 * this handles key rotation without requiring a restart.
 *
 * Refresh-window jitter avoids thundering-herd stampedes when multiple
 * workers share the same process lifetime.
 */
export class JwksCache {
  private cache: CacheEntry | null = null;

  constructor(
    private readonly config: JwksCacheConfig,
    private readonly fetch: FetchFn,
    private readonly clock: Clock,
  ) {}

  /** Returns the cached key for `kid`, fetching if needed. Refreshes once on kid miss. */
  async getKey(kid: string): Promise<JoseKey | null> {
    let entry = await this.getValidEntry();
    const cached = entry.keys.get(kid);
    if (cached !== undefined) {
      return cached;
    }

    // kid miss — refresh once to handle key rotation
    entry = await this.refresh();
    return entry.keys.get(kid) ?? null;
  }

  private async getValidEntry(): Promise<CacheEntry> {
    if (this.cache !== null && this.clock.now() < this.cache.expiresAt) {
      return this.cache;
    }
    return this.refresh();
  }

  private async refresh(): Promise<CacheEntry> {
    const response = await this.fetch(this.config.jwksUrl);
    if (!response.ok) {
      throw new Error(`JWKS fetch failed for ${this.config.jwksUrl}`);
    }
    const body = (await response.json()) as JwksResponse;
    const keys = new Map<string, JoseKey>();

    for (const jwk of body.keys ?? []) {
      if (!jwk.kid) continue;
      try {
        const key = await importJWK(jwk as Parameters<typeof importJWK>[0]);
        keys.set(jwk.kid, key);
      } catch {
        // Skip malformed individual keys — don't fail the whole cache refresh
      }
    }

    const ttl = this.config.ttlMs ?? DEFAULT_TTL_MS;
    const jitter = Math.random() * (this.config.jitterMs ?? DEFAULT_JITTER_MS);
    const entry: CacheEntry = {
      keys,
      expiresAt: this.clock.now() + ttl + jitter,
    };
    this.cache = entry;
    return entry;
  }
}
