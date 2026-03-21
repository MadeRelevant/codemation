import type { TypeToken } from "../../../di";

import { getPersistedRuntimeTypeMetadata } from "../../../runtime-types/runtimeTypeDecorators.types";

import type { PersistedTokenId } from "../../../types";

export class PersistedRuntimeTypeIdFactory {
  static fromMetadata(args: Readonly<{ type: TypeToken<unknown> }>): PersistedTokenId | undefined {
    const metadata = getPersistedRuntimeTypeMetadata(args.type);
    if (!metadata) {
      return undefined;
    }
    const packageName = metadata.packageName;
    if (!packageName) {
      return undefined;
    }
    return `${packageName}::${metadata.persistedName}` as PersistedTokenId;
  }
}

