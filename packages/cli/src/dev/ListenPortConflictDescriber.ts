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

    const raw = await this.readLsofOutput(port);
    if (raw === null) {
      return null;
    }
    const occupants = this.parseLsofOutput(raw);
    if (occupants.length === 0) {
      return null;
    }

    return occupants
      .map((occupant) => `pid=${occupant.pid} command=${occupant.command} endpoint=${occupant.endpoint}`)
      .join("; ");
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
}
