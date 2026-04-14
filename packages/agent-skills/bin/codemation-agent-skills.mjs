#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export {
  CodemationAgentSkillsCli,
  CommandError,
  CommandLineParser,
  FileSystemGateway,
  SkillExtractor,
  resolveAgentSkillsPackageRoot,
} from "../lib/agent-skills-extractor.mjs";

import { CodemationAgentSkillsCli } from "../lib/agent-skills-extractor.mjs";

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await new CodemationAgentSkillsCli(process.argv.slice(2), process.cwd(), process.stdout, process.stderr).run();
}
