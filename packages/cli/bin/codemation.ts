#!/usr/bin/env node
import "reflect-metadata";
import { CodemationCliBin } from "../src/CodemationCliBin";

void CodemationCliBin.run(process.argv.slice(2));
