import { inject, injectable } from "@codemation/core";
import type {
  CallerContext,
  CredentialMaterialProvider,
  CredentialMaterialRef,
  MaterialBundle,
} from "@codemation/core";

import { ApplicationTokens } from "../applicationTokens";
import type { Logger, LoggerFactory } from "../application/logging/Logger";
import { LocalCredentialMaterialProvider } from "./LocalCredentialMaterialProvider";

type CacheEntry = Readonly<{
  material: MaterialBundle;
  expiresAt: number;
}>;

/**
 * In-memory TTL cache decorator for `CredentialMaterialProvider`.
 *
 * - Hits avoid the wrapped provider (no CP RPC, no audit row).
 * - Misses/expired entries delegate to the wrapped provider and store the
 *   result with TTL = `min(material.expiresAt − 60s, now + 5min)`.
 * - `setMaterial` delegates and then invalidates the entry, so the next
 *   `getMaterial` re-fetches fresh bytes.
 *
 * Cache is process-local only — never serialized, never shared across pods.
 * See `docs/design/credentials-oauth-unification.md` and
 * `planning/sprints/credentials-vault/03-in-memory-material-cache.md`.
 */
@injectable()
export class CachingCredentialMaterialProvider implements CredentialMaterialProvider {
  private static readonly HARD_CAP_MS = 5 * 60 * 1000;
  private static readonly EXPIRY_SAFETY_WINDOW_MS = 60 * 1000;

  private readonly cache = new Map<string, CacheEntry>();
  private readonly logger: Logger;

  constructor(
    @inject(LocalCredentialMaterialProvider) private readonly inner: CredentialMaterialProvider,
    @inject(ApplicationTokens.LoggerFactory) loggerFactory: LoggerFactory,
  ) {
    this.logger = loggerFactory.create("codemation.credentials.material-cache");
  }

  async getMaterial(ref: CredentialMaterialRef, context: CallerContext): Promise<MaterialBundle> {
    const key = this.keyFor(ref);
    const now = Date.now();
    const entry = this.cache.get(key);
    if (entry && entry.expiresAt > now) {
      this.logger.debug(`material-cache hit key=${key}`);
      return entry.material;
    }
    if (entry) {
      this.logger.debug(`material-cache expired key=${key}`);
      this.cache.delete(key);
    } else {
      this.logger.debug(`material-cache miss key=${key}`);
    }
    const material = await this.inner.getMaterial(ref, context);
    const ttlExpiry = this.computeCacheExpiry(material, Date.now());
    if (ttlExpiry !== null) {
      this.cache.set(key, { material, expiresAt: ttlExpiry });
    }
    return material;
  }

  async setMaterial(ref: CredentialMaterialRef, material: MaterialBundle): Promise<void> {
    await this.inner.setMaterial(ref, material);
    this.cache.delete(this.keyFor(ref));
  }

  private keyFor(ref: CredentialMaterialRef): string {
    return `${ref.source}::${ref.id}`;
  }

  /**
   * Returns the absolute epoch-ms at which the cache entry should expire, or
   * `null` if the entry should not be cached (computed TTL ≤ 0).
   */
  private computeCacheExpiry(material: MaterialBundle, now: number): number | null {
    const hardCapExpiry = now + CachingCredentialMaterialProvider.HARD_CAP_MS;
    if (material.expiresAt === undefined) {
      return hardCapExpiry;
    }
    const parsed = Date.parse(material.expiresAt);
    if (Number.isNaN(parsed)) {
      return hardCapExpiry;
    }
    const safeExpiry = parsed - CachingCredentialMaterialProvider.EXPIRY_SAFETY_WINDOW_MS;
    const clamped = Math.min(safeExpiry, hardCapExpiry);
    if (clamped <= now) {
      return null;
    }
    return clamped;
  }
}
