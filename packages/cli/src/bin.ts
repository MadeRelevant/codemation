import process from "node:process";
import "reflect-metadata";

import { CliBin } from "./CliBin";

void CliBin.run(process.argv.slice(2));
