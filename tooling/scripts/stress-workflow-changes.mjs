import { access, readFile, writeFile, utimes } from "node:fs/promises";
import path from "node:path";

function readArg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) return null;
  return value;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function parsePositiveInt(raw, fallback) {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

async function resolveRepoRoot() {
  let current = path.resolve(process.cwd());
  while (true) {
    try {
      await access(path.resolve(current, "pnpm-workspace.yaml"));
      return current;
    } catch {
      // ignore
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return process.cwd();
    }
    current = parent;
  }
}

const repoRoot = await resolveRepoRoot();
const defaultTarget = path.resolve(
  repoRoot,
  "apps",
  "test-dev",
  "src",
  "workflows",
  "tutorials",
  "rfq-example",
  "example.ts",
);

const targetPath = path.resolve(readArg("--file") ?? defaultTarget);
const iterations = parsePositiveInt(readArg("--iterations"), 50);
const intervalMs = parsePositiveInt(readArg("--interval-ms"), 100);
const mode = readArg("--mode") ?? (hasFlag("--touch") ? "touch" : "rewrite");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const original = await readFile(targetPath, "utf8");

try {
  for (let i = 1; i <= iterations; i += 1) {
    if (mode === "touch") {
      const now = new Date();
      await utimes(targetPath, now, now);
    } else {
      const next = `${original.replace(/\n?$/, "\n")}// codemation-stress ${i} ${Date.now()}\n`;
      await writeFile(targetPath, next, "utf8");
    }
    await sleep(intervalMs);
  }
} finally {
  await writeFile(targetPath, original, "utf8").catch(() => null);
}

