import type { Item, Items } from "../contracts/workflowTypes";
import { injectable } from "../di";

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
