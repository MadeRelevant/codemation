import { CodemationBootstrapRequest } from "./CodemationBootstrapRequest";

export class CodemationWorkerBootstrapRequest {
  readonly bootstrap: CodemationBootstrapRequest;
  readonly queues: ReadonlyArray<string>;
  readonly bootstrapSource?: string | null;

  constructor(
    args: Readonly<{
      bootstrap: CodemationBootstrapRequest;
      queues: ReadonlyArray<string>;
      bootstrapSource?: string | null;
    }>,
  ) {
    this.bootstrap = args.bootstrap;
    this.queues = [...args.queues];
    this.bootstrapSource = args.bootstrapSource;
  }
}
