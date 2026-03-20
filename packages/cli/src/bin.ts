import "reflect-metadata";
import process from "node:process";
import { CodemationCliBin } from "./CodemationCliBin";

void CodemationCliBin.run(process.argv.slice(2));

