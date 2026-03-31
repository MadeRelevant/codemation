import type { CodemationFrontendAuthSnapshot } from "@codemation/host/client";
import { FrontendAppConfigJsonCodec } from "@codemation/host/client";

export class AuthSnapshotReader {
  private static readonly jsonCodec = new FrontendAppConfigJsonCodec();

  static readFromEnvironment(): CodemationFrontendAuthSnapshot | null {
    return AuthSnapshotReader.jsonCodec.deserialize(process.env.CODEMATION_FRONTEND_APP_CONFIG_JSON)?.auth ?? null;
  }
}
