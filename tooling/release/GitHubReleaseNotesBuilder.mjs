import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

export class GitHubReleaseNotesBuilder {
  constructor({ rootDirectory, repository, version, tag }) {
    this.rootDirectory = rootDirectory;
    this.repository = repository;
    this.version = version;
    this.tag = tag;
  }

  async build() {
    const packageReleaseNotes = await this.#readPackageReleaseNotes();

    if (packageReleaseNotes.length === 0) {
      throw new Error(`No package changelog sections were found for version ${this.version}.`);
    }

    const lines = [
      `# ${this.tag}`,
      "",
      `Aggregated release notes for ${packageReleaseNotes.length} published package${packageReleaseNotes.length === 1 ? "" : "s"}.`,
      "",
      "## Published packages",
      "",
      ...packageReleaseNotes.map((releaseNotes) => `- \`${releaseNotes.packageName}\``),
      "",
    ];

    for (const releaseNotes of packageReleaseNotes) {
      lines.push(`## ${releaseNotes.packageName}`);
      lines.push("");
      lines.push(releaseNotes.notes);
      lines.push("");
    }

    lines.push(`Source snapshot: [${this.tag}](https://github.com/${this.repository}/tree/${this.tag})`);

    return `${lines.join("\n").trim()}\n`;
  }

  async #readPackageReleaseNotes() {
    const packagesDirectory = path.join(this.rootDirectory, "packages");
    const packageDirectories = await readdir(packagesDirectory, {
      withFileTypes: true,
    });
    const publishedPackages = [];

    for (const entry of packageDirectories.sort((left, right) => left.name.localeCompare(right.name))) {
      if (!entry.isDirectory()) {
        continue;
      }

      const packageDirectory = path.join(packagesDirectory, entry.name);
      const packageManifest = await this.#readPackageManifest(packageDirectory);

      if (packageManifest === null) {
        continue;
      }

      if (packageManifest.version !== this.version) {
        continue;
      }

      const notes = await this.#readVersionNotes(packageDirectory);
      if (notes === null) {
        continue;
      }

      publishedPackages.push({
        packageName: packageManifest.name,
        notes,
      });
    }

    return publishedPackages;
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

  async #readVersionNotes(packageDirectory) {
    const changelogPath = path.join(packageDirectory, "CHANGELOG.md");
    const changelogContent = await readFile(changelogPath, "utf8");

    return this.#extractVersionSection(changelogContent);
  }

  #extractVersionSection(changelogContent) {
    const lines = changelogContent.split("\n");
    const versionHeading = `## ${this.version}`;
    const startIndex = lines.findIndex((line) => line.trim() === versionHeading);

    if (startIndex === -1) {
      return null;
    }

    let endIndex = lines.length;
    for (let index = startIndex + 1; index < lines.length; index += 1) {
      if (lines[index].startsWith("## ")) {
        endIndex = index;
        break;
      }
    }

    const section = lines
      .slice(startIndex + 1, endIndex)
      .join("\n")
      .trim();
    if (section.length === 0) {
      return null;
    }

    return section;
  }
}
