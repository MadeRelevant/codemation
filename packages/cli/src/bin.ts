import process from "node:process";
import "reflect-metadata";

import { CliBin } from "./CliBin";

const codemationArgs = process.argv.slice(2);
void CliBin.run(codemationArgs);
