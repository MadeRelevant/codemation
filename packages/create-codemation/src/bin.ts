import process from "node:process";

import { CreateCodemationCliBin } from "./CreateCodemationCliBin";

void CreateCodemationCliBin.run(process.argv.slice(2), import.meta.url);
