import { spawnSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);

class PrismaClientGenerator {
  static providers = ["postgresql", "sqlite"];
  static prismaCliEntrypoint = require.resolve("prisma/build/index.js");
  static minimumNodeVersion = { major: 20, minor: 19 };
  static reexecMarker = "CODEMATION_PRISMA_GENERATE_REEXEC";

  static run() {
    this.reexecUnderSupportedNodeWhenNeeded();
    for (const provider of this.providers) {
      const result = spawnSync(process.execPath, [this.prismaCliEntrypoint, "generate"], {
        cwd: import.meta.dirname.replace(/\/scripts$/, ""),
        env: {
          ...process.env,
          CODEMATION_PRISMA_PROVIDER: provider,
        },
        stdio: "inherit",
        shell: false,
      });
      if (result.status !== 0) {
        process.exit(result.status ?? 1);
      }
    }
  }

  static reexecUnderSupportedNodeWhenNeeded() {
    if (process.env[this.reexecMarker] === "1" || this.isSupportedNode(process.versions.node)) {
      return;
    }
    const supportedNodeBinary = this.resolveSupportedNodeBinary();
    if (!supportedNodeBinary) {
      throw new Error(
        `Prisma generation requires Node >= ${this.minimumNodeVersion.major}.${this.minimumNodeVersion.minor}. ` +
          `Current process is ${process.versions.node} and no supported Node binary could be resolved.`,
      );
    }
    const result = spawnSync(supportedNodeBinary, [new URL(import.meta.url).pathname], {
      cwd: import.meta.dirname.replace(/\/scripts$/, ""),
      env: {
        ...process.env,
        [this.reexecMarker]: "1",
      },
      stdio: "inherit",
      shell: false,
    });
    process.exit(result.status ?? 1);
  }

  static resolveSupportedNodeBinary() {
    const pnpmPath = this.resolvePnpmPath();
    if (!pnpmPath) {
      return undefined;
    }
    const pnpmDir = path.dirname(pnpmPath);
    const candidates = [path.join(pnpmDir, "node"), path.resolve(pnpmDir, "../../../../bin/node")];
    for (const candidate of candidates) {
      if (!existsSync(candidate)) {
        continue;
      }
      const versionResult = spawnSync(candidate, ["-p", "process.versions.node"], {
        env: process.env,
        encoding: "utf8",
        shell: false,
      });
      if (versionResult.status === 0 && this.isSupportedNode(versionResult.stdout.trim())) {
        return candidate;
      }
    }
    return undefined;
  }

  static resolvePnpmPath() {
    const npmExecPath = process.env.npm_execpath?.trim();
    if (npmExecPath) {
      return realpathSync(npmExecPath);
    }
    const result = spawnSync("bash", ["-lc", 'realpath "$(command -v pnpm)"'], {
      env: process.env,
      encoding: "utf8",
      shell: false,
    });
    if (result.status !== 0) {
      return undefined;
    }
    const pnpmPath = result.stdout.trim();
    return pnpmPath.length > 0 ? pnpmPath : undefined;
  }

  static isSupportedNode(version) {
    const [majorText = "0", minorText = "0"] = version.split(".");
    const major = Number(majorText);
    const minor = Number(minorText);
    if (!Number.isInteger(major) || !Number.isInteger(minor)) {
      return false;
    }
    if (major > this.minimumNodeVersion.major) {
      return true;
    }
    if (major < this.minimumNodeVersion.major) {
      return false;
    }
    return minor >= this.minimumNodeVersion.minor;
  }
}

PrismaClientGenerator.run();
