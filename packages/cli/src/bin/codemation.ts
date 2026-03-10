import "reflect-metadata";
import { CodemationCliProgram } from "../cliProgram";

await new CodemationCliProgram().run(process.argv.slice(2));
