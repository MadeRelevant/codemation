import process from "node:process";
import "reflect-metadata";
import { CodemationCliBin } from "./CodemationCliBin";

void CodemationCliBin.run(process.argv.slice(2));

