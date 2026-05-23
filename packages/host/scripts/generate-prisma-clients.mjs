import { spawnSync } from "node:child_process";
import { execaSync } from "execa";
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
        cwd: path.dirname(import.meta.dirname),
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
      cwd: path.dirname(import.meta.dirname),
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
    try {
      // execa resolves bare command names against the OS-appropriate PATH (handles `.cmd` / `.exe`
      // shims on Windows automatically), so this works on every platform we run dev on.
      const result = execaSync("pnpm", ["root", "-g"], { reject: false });
      if (result.exitCode === 0 && typeof result.stdout === "string" && result.stdout.trim().length > 0) {
        // pnpm root -g prints "<pnpm-store>/global/5/node_modules"; the pnpm binary lives one level
        // up under the install root. We only need *a* directory close to the pnpm binary so the
        // sibling-`node` lookup below can probe candidate paths.
        const globalRoot = result.stdout.trim();
        const candidate = path.resolve(globalRoot, "..", "..", "pnpm");
        if (existsSync(candidate)) {
          return realpathSync(candidate);
        }
      }
    } catch {
      // fall through
    }
    return undefined;
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
