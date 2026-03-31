import type { CodemationFrontendAuthSnapshot } from "@codemation/host/client";

import { AuthSnapshotReader } from "./AuthSnapshotReader";

export class AuthSnapshotResolver {
  static async resolve(): Promise<CodemationFrontendAuthSnapshot> {
    const fromEnvironment = AuthSnapshotReader.readFromEnvironment();
    if (fromEnvironment) {
      return fromEnvironment;
    }
    const { CodemationNextHost } = await import("../server/CodemationNextHost");
    return (await CodemationNextHost.shared.getFrontendAppConfig()).auth;
  }
}
