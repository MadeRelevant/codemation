import { CodemationBootstrapRequest } from "./CodemationBootstrapRequest";

export class CodemationFrontendBootstrapRequest {
  readonly bootstrap: CodemationBootstrapRequest;
  readonly skipPresentationServers: boolean;

  constructor(
    args: Readonly<{
      bootstrap: CodemationBootstrapRequest;
      skipPresentationServers?: boolean;
    }>,
  ) {
    this.bootstrap = args.bootstrap;
    this.skipPresentationServers = args.skipPresentationServers ?? false;
  }
}
