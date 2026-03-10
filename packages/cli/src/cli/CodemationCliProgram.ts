import { CodemationCliArgumentParser } from "./CodemationCliArgumentParser";
import { CodemationCliOptionReader } from "./CodemationCliOptionReader";
import { CodemationDevSupervisor } from "./CodemationDevSupervisor";
import { CodemationPathResolver } from "./CodemationPathResolver";
import { CodemationServiceRunner } from "./CodemationServiceRunner";

export class CodemationCliProgram {
  constructor(
    private readonly argumentParser: CodemationCliArgumentParser = new CodemationCliArgumentParser(),
    private readonly pathResolver: CodemationPathResolver = new CodemationPathResolver(),
    private readonly devSupervisor: CodemationDevSupervisor = new CodemationDevSupervisor(),
    private readonly serviceRunner: CodemationServiceRunner = new CodemationServiceRunner(),
  ) {}

  async run(argv: ReadonlyArray<string>): Promise<void> {
    const parsedCommand = this.argumentParser.parse(argv);
    if (parsedCommand.name === "help" || new CodemationCliOptionReader(parsedCommand.options).has("help")) {
      console.log(this.argumentParser.getHelpText());
      return;
    }

    const options = new CodemationCliOptionReader(parsedCommand.options);
    const paths = await this.pathResolver.resolve(options);

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
}
