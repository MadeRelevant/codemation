import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

class DocsDevProgram {
  #docsDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  #defaultPort = process.env.PORT?.trim() || "4000";

  #pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

  async run() {
    await this.#stopStaleDocsServers();
    const child = this.#spawnNextDev();
    child.on("exit", (code, signal) => {
      if (signal) {
        process.kill(process.pid, signal);
        return;
      }
      process.exit(code ?? 0);
    });
  }

  async #stopStaleDocsServers() {
    if (process.platform !== "linux") {
      return;
    }

    const stalePids = await this.#findStaleNextServerPids();
    for (const pid of stalePids) {
      await this.#terminateProcess(pid);
    }
  }

  async #findStaleNextServerPids() {
    const procEntries = await fs.readdir("/proc");
    const docsDirectory = await fs.realpath(this.#docsDirectory);
    const currentPid = process.pid;
    const parentPid = process.ppid;
    const stalePids = [];

    for (const entry of procEntries) {
      if (!/^\d+$/.test(entry)) {
        continue;
      }

      const pid = Number(entry);
      if (pid === currentPid || pid === parentPid) {
        continue;
      }

      const processDirectory = path.join("/proc", entry);
      const matches = await this.#isDocsNextServerProcess(processDirectory, docsDirectory);
      if (matches) {
        stalePids.push(pid);
      }
    }

    return stalePids;
  }

  async #isDocsNextServerProcess(processDirectory, docsDirectory) {
    try {
      const cwd = await fs.realpath(path.join(processDirectory, "cwd"));
      if (cwd !== docsDirectory) {
        return false;
      }

      const comm = await fs.readFile(path.join(processDirectory, "comm"), "utf8");
      const cmdline = await fs.readFile(path.join(processDirectory, "cmdline"), "utf8");
      const normalizedComm = comm.trim();
      const normalizedCmdline = cmdline.split("\0").join(" ");

      return (
        normalizedComm === "next-server" ||
        normalizedCmdline.includes("next-server") ||
        normalizedCmdline.includes("next/dist/bin/next")
      );
    } catch {
      return false;
    }
  }

  async #terminateProcess(pid) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      return;
    }

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await this.#sleep(200);
      if (!this.#isProcessAlive(pid)) {
        return;
      }
    }

    try {
      process.kill(pid, "SIGKILL");
    } catch {
      return;
    }
  }

  #isProcessAlive(pid) {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  #sleep(milliseconds) {
    return new Promise((resolve) => {
      setTimeout(resolve, milliseconds);
    });
  }

  #spawnNextDev() {
    // This script is the environment boundary for the docs dev process.
    return spawn(this.#pnpmCommand, ["exec", "next", "dev", "--port", this.#defaultPort], {
      cwd: this.#docsDirectory,
      stdio: "inherit",
      env: process.env,
    });
  }
}

const program = new DocsDevProgram();
void program.run();
