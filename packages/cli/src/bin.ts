import process from "node:process";
import "reflect-metadata";

import { CliBin } from "./CliBin";

const codemationArgs = process.argv.slice(2);
if (codemationArgs[0] === "dev" || codemationArgs[0] === "dev:plugin") {
  process.env.CODEMATION_PREFER_PLUGIN_SOURCE_ENTRY = "true";
}

void CliBin.run(codemationArgs);
