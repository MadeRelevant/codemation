import process from "node:process";
import { CodemationCliArgumentParser } from "./CodemationCliArgumentParser";
import { CodemationCliOptionReader } from "./CodemationCliOptionReader";
import { CodemationDevSupervisor } from "./CodemationDevSupervisor";
import { CodemationPathResolver } from "./CodemationPathResolver";
import { CodemationServiceRunner } from "./CodemationServiceRunner";
import { CodemationStartRouteWriter } from "./CodemationStartRouteWriter";
import type { CodemationResolvedPaths } from "./types";

export class CodemationCliProgram {
  constructor(
    private readonly argumentParser: CodemationCliArgumentParser = new CodemationCliArgumentParser(),
    private readonly pathResolver: CodemationPathResolver = new CodemationPathResolver(),
    private readonly devSupervisor: CodemationDevSupervisor = new CodemationDevSupervisor(),
    private readonly serviceRunner: CodemationServiceRunner = new CodemationServiceRunner(),
    private readonly startRouteWriter: CodemationStartRouteWriter = new CodemationStartRouteWriter(),
  ) {}

  async run(argv: ReadonlyArray<string>): Promise<void> {
    const parsedCommand = this.argumentParser.parse(argv);
    if (parsedCommand.name === "help" || new CodemationCliOptionReader(parsedCommand.options).has("help")) {
      console.log(this.argumentParser.getHelpText());
      return;
    }

    const options = new CodemationCliOptionReader(parsedCommand.options);
    const paths = await this.pathResolver.resolve(options);
    this.synchronizeEnvironment(paths);
    await this.startRouteWriter.sync(paths);

    if (parsedCommand.name === "dev") {
      await this.devSupervisor.start(paths);
      return;
    }
    if (parsedCommand.name === "host") {
      await this.serviceRunner.runHost(paths);
      return;
    }
    await this.serviceRunner.runWorker(paths);
  }

  private synchronizeEnvironment(paths: CodemationResolvedPaths): void {
    process.env.CODEMATION_CONSUMER_ROOT = paths.consumerRoot;
    process.env.CODEMATION_CONSUMER_PACKAGE_NAME = paths.consumerPackageName;
    if (paths.consumerPackageJsonPath) {
      process.env.CODEMATION_CONSUMER_PACKAGE_JSON = paths.consumerPackageJsonPath;
    }
  }
}
