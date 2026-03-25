#!/usr/bin/env node
import "reflect-metadata";
import { CliBin } from "../src/CliBin";

void CliBin.run(process.argv.slice(2));
