import "reflect-metadata";
import { CodemationWorkerCli } from "../src/CodemationWorkerCli";

const cli = new CodemationWorkerCli();
void cli.run(process.argv.slice(2));
