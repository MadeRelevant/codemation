import { execFile } from "node:child_process";
import process from "node:process";

type PortOccupant = Readonly<{
  pid: number;
  command: string;
  endpoint: string;
}>;

export class ListenPortConflictDescriber {
  constructor(private readonly platform: NodeJS.Platform = process.platform) {}

  async describeLoopbackPort(port: number): Promise<string | null> {
    if (!Number.isInteger(port) || port <= 0) {
      return null;
    }
    if (this.platform !== "linux" && this.platform !== "darwin") {
      return null;
    }

    const occupants = await this.resolveLoopbackOccupants(port);
    if (occupants.length === 0) {
      return null;
    }

    return occupants
      .map((occupant) => `pid=${occupant.pid} command=${occupant.command} endpoint=${occupant.endpoint}`)
      .join("; ");
  }

  private async resolveLoopbackOccupants(port: number): Promise<ReadonlyArray<PortOccupant>> {
    const lsofRaw = await this.readLsofOutput(port);
    const fromLsof = lsofRaw !== null ? this.parseLsofOutput(lsofRaw) : [];
    if (fromLsof.length > 0) {
      return fromLsof;
    }
    if (this.platform !== "linux") {
      return [];
    }
    const ssRaw = await this.readSsOutput(port);
    if (ssRaw === null) {
      return [];
    }
    return this.parseSsListenOutput(ssRaw, port);
  }

  private async readLsofOutput(port: number): Promise<string | null> {
    try {
      return await new Promise<string>((resolve, reject) => {
        execFile("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-Fpcn"], (error, stdout) => {
          if (error) {
            reject(error);
            return;
          }
          resolve(stdout);
        });
      });
    } catch {
      return null;
    }
  }

  private parseLsofOutput(raw: string): ReadonlyArray<PortOccupant> {
    const occupants: PortOccupant[] = [];
    let currentPid: number | null = null;
    let currentCommand: string | null = null;

    for (const line of raw.split("\n")) {
      if (line.length < 2) {
        continue;
      }
      const prefix = line[0];
      const value = line.slice(1).trim();

      if (prefix === "p") {
        currentPid = Number.parseInt(value, 10);
        currentCommand = null;
        continue;
      }
      if (prefix === "c") {
        currentCommand = value;
        continue;
      }
      if (prefix === "n" && currentPid !== null && currentCommand !== null) {
        occupants.push({
          pid: currentPid,
          command: currentCommand,
          endpoint: value,
        });
      }
    }

    return occupants;
  }

  private async readSsOutput(port: number): Promise<string | null> {
    const filtered = await this.execFileStdout("ss", ["-lntp", `sport = :${port}`]);
    if (filtered !== null && filtered.trim().length > 0) {
      return filtered;
    }
    return this.execFileStdout("ss", ["-lntp"]);
  }

  private async execFileStdout(command: string, args: readonly string[]): Promise<string | null> {
    try {
      return await new Promise<string>((resolve, reject) => {
        execFile(command, [...args], (error, stdout) => {
          if (error) {
            reject(error);
            return;
          }
          resolve(stdout);
        });
      });
    } catch {
      return null;
    }
  }

  private parseSsListenOutput(raw: string, port: number): ReadonlyArray<PortOccupant> {
    const occupants: PortOccupant[] = [];
    const portSuffix = `:${port}`;
    for (const line of raw.split("\n")) {
      if (!line.includes("LISTEN") || !line.includes(portSuffix)) {
        continue;
      }
      const pidMatch = line.match(/pid=(\d+)/);
      if (!pidMatch) {
        continue;
      }
      const pid = Number.parseInt(pidMatch[1] ?? "0", 10);
      const cmdMatch = line.match(/users:\(\("([^"]*)"/);
      const command = cmdMatch?.[1] ?? "unknown";
      const localAddrMatch = line.match(/\s+(\S+:\d+|\[[^\]]+\]:\d+)\s+/);
      const endpoint = localAddrMatch?.[1] ?? `tcp:${String(port)}`;
      occupants.push({
        pid,
        command,
        endpoint,
      });
    }
    return occupants;
  }
}
