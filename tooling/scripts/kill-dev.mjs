#!/usr/bin/env node
// Cross-platform port killer for stuck `codemation dev` processes.
// Usage: pnpm run kill-dev           # kills default dev ports (3000, 3001)
//        pnpm run kill-dev 4000 4001 # kills custom ports
//
// Why: ctrl-C on Windows sometimes leaves orphan Node processes holding the
// Next.js port (3000) or the websocket port (3001), surfacing as
// "EADDRINUSE :::3001" on the next `pnpm dev`. There is no single shell
// idiom for "kill whoever owns port N" across Windows/macOS/Linux.

import { execSync } from "node:child_process";
import process from "node:process";

const DEFAULT_PORTS = [3000, 3001];

function parsePortsFromArgs() {
  const args = process.argv.slice(2).filter(Boolean);
  if (args.length === 0) return DEFAULT_PORTS;
  const ports = args
    .flatMap((arg) => arg.split(","))
    .map((raw) => Number(raw.trim()))
    .filter((n) => Number.isInteger(n) && n > 0 && n < 65536);
  return ports.length > 0 ? ports : DEFAULT_PORTS;
}

function findPidsWindows(port) {
  let stdout;
  try {
    stdout = execSync(`netstat -ano -p TCP`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return [];
  }
  const pids = new Set();
  for (const line of stdout.split(/\r?\n/)) {
    // Format: "  TCP    [::]:3001    [::]:0    LISTENING    12345"
    if (!/\bLISTENING\b/.test(line)) continue;
    if (!line.includes(`:${port} `) && !line.includes(`:${port}\t`)) continue;
    const cols = line.trim().split(/\s+/);
    const pid = Number(cols[cols.length - 1]);
    if (Number.isInteger(pid) && pid > 0) pids.add(pid);
  }
  return [...pids];
}

function findPidsUnix(port) {
  try {
    const stdout = execSync(`lsof -ti tcp:${port} -sTCP:LISTEN`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return stdout
      .split(/\r?\n/)
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n) && n > 0);
  } catch {
    return [];
  }
}

function killWindows(pid) {
  try {
    execSync(`taskkill /F /PID ${pid} /T`, { stdio: ["ignore", "ignore", "ignore"] });
    return true;
  } catch {
    return false;
  }
}

function killUnix(pid) {
  try {
    process.kill(pid, "SIGKILL");
    return true;
  } catch {
    return false;
  }
}

const isWindows = process.platform === "win32";
const findPids = isWindows ? findPidsWindows : findPidsUnix;
const killPid = isWindows ? killWindows : killUnix;

const ports = parsePortsFromArgs();
let totalKilled = 0;
let anyHits = false;

for (const port of ports) {
  const pids = findPids(port);
  if (pids.length === 0) {
    console.log(`port ${port}: nothing listening`);
    continue;
  }
  anyHits = true;
  for (const pid of pids) {
    const ok = killPid(pid);
    if (ok) {
      console.log(`port ${port}: killed pid ${pid}`);
      totalKilled += 1;
    } else {
      console.log(`port ${port}: failed to kill pid ${pid} (may already be gone)`);
    }
  }
}

if (!anyHits) {
  console.log("nothing to kill");
}
process.exit(0);
