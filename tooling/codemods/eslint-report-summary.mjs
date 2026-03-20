import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

class EslintReportSummaryCli {
  static main() {
    const cli = new EslintReportSummaryCli(process.argv.slice(2));
    cli.run();
  }

  constructor(args) {
    this.args = args;
    this.repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  }

  run() {
    const reportPath = this.args[0];
    if (!reportPath) {
      throw new Error("Usage: node tooling/codemods/eslint-report-summary.mjs <eslint-json-report>");
    }

    const payload = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    if (!Array.isArray(payload)) {
      throw new Error("Expected ESLint JSON formatter output.");
    }

    const summary = this.createSummary(payload);
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  }

  createSummary(results) {
    const ruleCounts = new Map();
    const fileCounts = new Map();
    const packageCounts = new Map();
    let errorCount = 0;
    let warningCount = 0;
    let fixableErrorCount = 0;
    let fixableWarningCount = 0;

    for (const result of results) {
      const relativePath = this.toRelativePath(result.filePath);
      const packageKey = this.getPackageKey(relativePath);
      const problemCount = Array.isArray(result.messages) ? result.messages.length : 0;

      if (problemCount > 0) {
        fileCounts.set(relativePath, problemCount);
        packageCounts.set(packageKey, (packageCounts.get(packageKey) ?? 0) + problemCount);
      }

      errorCount += result.errorCount ?? 0;
      warningCount += result.warningCount ?? 0;
      fixableErrorCount += result.fixableErrorCount ?? 0;
      fixableWarningCount += result.fixableWarningCount ?? 0;

      for (const message of result.messages ?? []) {
        const ruleKey = message.ruleId ?? "(unknown)";
        const previous = ruleCounts.get(ruleKey) ?? { total: 0, errors: 0, warnings: 0 };
        previous.total += 1;
        if (message.severity === 2) {
          previous.errors += 1;
        } else if (message.severity === 1) {
          previous.warnings += 1;
        }
        ruleCounts.set(ruleKey, previous);
      }
    }

    return {
      totalFilesWithProblems: [...fileCounts.keys()].length,
      errorCount,
      warningCount,
      fixableErrorCount,
      fixableWarningCount,
      topRules: this.mapToSortedArray(ruleCounts, 15, (value) => ({
        total: value.total,
        errors: value.errors,
        warnings: value.warnings,
      })),
      topFiles: this.mapToSortedArray(fileCounts, 20, (value) => value),
      topPackages: this.mapToSortedArray(packageCounts, 15, (value) => value),
    };
  }

  mapToSortedArray(map, limit, projectValue) {
    return [...map.entries()]
      .sort((left, right) => {
        const leftValue = typeof left[1] === "number" ? left[1] : left[1].total;
        const rightValue = typeof right[1] === "number" ? right[1] : right[1].total;
        if (rightValue !== leftValue) return rightValue - leftValue;
        return String(left[0]).localeCompare(String(right[0]));
      })
      .slice(0, limit)
      .map(([key, value]) => ({
        key,
        value: projectValue(value),
      }));
  }

  toRelativePath(filePath) {
    const normalized = path.resolve(filePath);
    return path.relative(this.repoRoot, normalized) || ".";
  }

  getPackageKey(relativePath) {
    const segments = relativePath.split(path.sep);
    if (segments[0] === "packages" && segments[1]) {
      return `packages/${segments[1]}`;
    }
    if (segments[0] === "apps" && segments[1]) {
      return `apps/${segments[1]}`;
    }
    return segments[0] || ".";
  }
}

EslintReportSummaryCli.main();
