import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

export class ReleaseTagVersionResolver {
  constructor({ rootDirectory }) {
    this.rootDirectory = rootDirectory;
    this.execFileAsync = promisify(execFile);
  }

  async resolve() {
    const packageVersions = await this.#readReleasePackageVersions();
    if (packageVersions.length === 0) {
      throw new Error("No published package versions were found under packages/.");
    }

    const uniqueVersions = [...new Set(packageVersions)];
    const highestPackageVersion = this.#maxSemanticVersion(uniqueVersions);
    const latestReleaseTagVersion = await this.#readLatestReleaseTagVersion();
    if (latestReleaseTagVersion === null) {
      return highestPackageVersion;
    }

    if (this.#compareSemanticVersions(highestPackageVersion, latestReleaseTagVersion) > 0) {
      return highestPackageVersion;
    }

    return this.#incrementPatchVersion(latestReleaseTagVersion);
  }

  async #readReleasePackageVersions() {
    const changedPackageVersions = await this.#readVersionsFromHeadPackageManifestDiff();
    if (changedPackageVersions.length > 0) {
      return changedPackageVersions;
    }

    return await this.#readPublishedPackageVersions();
  }

  async #readPublishedPackageVersions() {
    const packagesDirectory = path.join(this.rootDirectory, "packages");
    const packageEntries = await readdir(packagesDirectory, {
      withFileTypes: true,
    });
    const versions = [];

    for (const entry of packageEntries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const manifest = await this.#readPackageManifest(path.join(packagesDirectory, entry.name));
      if (manifest === null || manifest.private === true) {
        continue;
      }

      versions.push(manifest.version);
    }

    return versions;
  }

  async #readVersionsFromHeadPackageManifestDiff() {
    const changedPackageJsonPaths = await this.#readChangedPackageJsonPaths();
    const versions = [];

    for (const packageJsonPath of changedPackageJsonPaths) {
      const manifest = await this.#readPackageManifest(path.dirname(packageJsonPath));
      if (manifest === null || manifest.private === true) {
        continue;
      }

      versions.push(manifest.version);
    }

    return versions;
  }

  async #readPackageManifest(packageDirectory) {
    const packageJsonPath = path.join(packageDirectory, "package.json");
    let packageJsonContent;

    try {
      packageJsonContent = await readFile(packageJsonPath, "utf8");
    } catch (error) {
      if (error?.code === "ENOENT") {
        return null;
      }

      throw error;
    }

    return JSON.parse(packageJsonContent);
  }

  async #readChangedPackageJsonPaths() {
    let stdout;

    try {
      ({ stdout } = await this.#execGit(["diff", "--name-only", "HEAD^", "HEAD", "--", "packages/*/package.json"]));
    } catch {
      return [];
    }

    return stdout
      .split("\n")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
      .map((entry) => path.join(this.rootDirectory, entry));
  }

  async #readLatestReleaseTagVersion() {
    let stdout;

    try {
      ({ stdout } = await this.#execGit(["tag", "--list", "v*"]));
    } catch {
      return null;
    }

    const versions = stdout
      .split("\n")
      .map((entry) => entry.trim())
      .filter((entry) => /^v\d+\.\d+\.\d+$/.test(entry))
      .map((entry) => entry.slice(1));
    if (versions.length === 0) {
      return null;
    }

    return this.#maxSemanticVersion(versions);
  }

  #maxSemanticVersion(versions) {
    let best = versions[0];

    for (let index = 1; index < versions.length; index += 1) {
      const candidate = versions[index];
      if (this.#compareSemanticVersions(candidate, best) > 0) {
        best = candidate;
      }
    }

    return best;
  }

  #compareSemanticVersions(leftVersion, rightVersion) {
    const leftSegments = this.#parseSemanticVersion(leftVersion);
    const rightSegments = this.#parseSemanticVersion(rightVersion);

    for (let index = 0; index < Math.max(leftSegments.length, rightSegments.length); index += 1) {
      const leftValue = leftSegments[index] ?? 0;
      const rightValue = rightSegments[index] ?? 0;

      if (leftValue !== rightValue) {
        return leftValue - rightValue;
      }
    }

    return 0;
  }

  #parseSemanticVersion(version) {
    const match = /^(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)$/.exec(version);
    if (!match?.groups) {
      throw new Error(`Unsupported version format: ${version}`);
    }

    return [Number(match.groups.major), Number(match.groups.minor), Number(match.groups.patch)];
  }

  #incrementPatchVersion(version) {
    const [major, minor, patch] = this.#parseSemanticVersion(version);
    return `${major}.${minor}.${patch + 1}`;
  }

  async #execGit(args) {
    return await this.execFileAsync("git", args, {
      cwd: this.rootDirectory,
      env: this.#createGitEnvironment(),
    });
  }

  #createGitEnvironment() {
    const environment = { ...process.env };

    for (const key of Object.keys(environment)) {
      if (!key.startsWith("GIT_")) {
        continue;
      }

      delete environment[key];
    }

    return environment;
  }
}
