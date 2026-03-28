import type { Item, Items } from "../contracts/workflowTypes";
import { injectable } from "../di";

/**
 * Normalizes external inputs into the engine's canonical `Items` shape.
 * Used at host and builder boundaries where callers may provide either a raw value,
 * a single item-like object, or an array of item-like values.
 */
@injectable()
export class ItemsInputNormalizer {
  normalize(raw: unknown): Items {
    if (raw === undefined || raw === null) {
      return [];
    }
    if (Array.isArray(raw)) {
      return raw.map((value) => this.normalizeItem(value));
    }
    return [this.normalizeItem(raw)];
  }

  private normalizeItem(raw: unknown): Item {
    if (!this.isItem(raw)) {
      return { json: raw };
    }
    return {
      json: raw.json,
      ...(raw.binary === undefined ? {} : { binary: raw.binary }),
      ...(raw.meta === undefined ? {} : { meta: raw.meta }),
      ...(raw.paired === undefined ? {} : { paired: raw.paired }),
    };
  }

  private isItem(raw: unknown): raw is Item {
    return typeof raw === "object" && raw !== null && Object.prototype.hasOwnProperty.call(raw, "json");
  }
}
