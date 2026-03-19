#!/usr/bin/env node
import "reflect-metadata";
import { CodemationCli } from "../src/CodemationCli";

const cli = new CodemationCli();

void cli.run(process.argv.slice(2));
