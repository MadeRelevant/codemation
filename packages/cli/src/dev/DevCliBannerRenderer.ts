import boxen from "boxen";
import chalk from "chalk";
import figlet from "figlet";
import type { DevBootstrapSummaryJson } from "@codemation/host/next/server";

/**
 * Dev-only stdout branding (not the structured host logger).
 * Renders the figlet banner once on cold start; append-only compact block after hot reload.
 */
export class DevCliBannerRenderer {
  /**
   * Figlet header only — call early so branding appears before migrations / gateway work.
   */
  renderBrandHeader(): void {
    const titleLines = this.renderFigletTitle();
    const subtitle = chalk.dim.italic("AI Automation framework");
    const headerInner = `${titleLines}\n${subtitle}`;
    const headerBox = boxen(headerInner, {
      padding: { top: 0, bottom: 1, left: 1, right: 1 },
      margin: { bottom: 0 },
      borderStyle: "double",
      borderColor: "cyan",
      textAlignment: "center",
    });
    process.stdout.write(`${headerBox}\n`);
  }

  /**
   * Runtime detail + active workflows (after bootstrap summary is available).
   */
  renderRuntimeSummary(summary: DevBootstrapSummaryJson): void {
    const detailBody = this.buildDetailBody(summary);
    const detailBox = boxen(detailBody, {
      padding: { top: 0, bottom: 0, left: 1, right: 1 },
      margin: { top: 1, bottom: 0 },
      borderStyle: "round",
      borderColor: "gray",
      dimBorder: true,
      title: chalk.bold("Runtime"),
      titleAlignment: "center",
    });
    const activeSection = this.buildActiveWorkflowsSection(summary);
    process.stdout.write(`${detailBox}\n${activeSection}\n`);
  }

  renderFull(summary: DevBootstrapSummaryJson): void {
    this.renderBrandHeader();
    this.renderRuntimeSummary(summary);
  }

  /**
   * Shown after hot reload / watcher restarts (no figlet).
   */
  renderCompact(summary: DevBootstrapSummaryJson): void {
    const body = this.buildDetailBody(summary);
    const detailBox = boxen(body, {
      padding: { top: 0, bottom: 0, left: 1, right: 1 },
      margin: { top: 1, bottom: 0 },
      borderStyle: "round",
      borderColor: "gray",
      dimBorder: true,
      title: chalk.bold("Runtime (updated)"),
      titleAlignment: "center",
    });
    const activeSection = this.buildActiveWorkflowsSection(summary);
    process.stdout.write(`\n${detailBox}\n${activeSection}\n`);
  }

  private renderFigletTitle(): string {
    try {
      return chalk.cyan(figlet.textSync("Codemation", { font: "Slant" }));
    } catch {
      return chalk.cyan.bold("Codemation");
    }
  }

  private buildDetailBody(summary: DevBootstrapSummaryJson): string {
    const label = (text: string) => chalk.hex("#9ca3af")(text);
    const value = (text: string) => chalk.whiteBright(text);
    const lines = [
      `${label("Log level")}     ${value(summary.logLevel)}`,
      `${label("Database")}     ${value(summary.databaseLabel)}`,
      `${label("Scheduler")}    ${value(summary.schedulerLabel)}`,
      `${label("Event bus")}    ${value(summary.eventBusLabel)}`,
    ];
    if (summary.redisUrlRedacted) {
      lines.push(`${label("Redis")}        ${value(summary.redisUrlRedacted)}`);
    }
    return lines.join("\n");
  }

  private buildActiveWorkflowsSection(summary: DevBootstrapSummaryJson): string {
    const lines =
      summary.activeWorkflows.length === 0
        ? [chalk.dim("  (none active)")]
        : summary.activeWorkflows.map((w) => `${chalk.whiteBright(`  • ${w.name} `)}${chalk.dim(`(${w.id})`)}`);
    return boxen(lines.join("\n"), {
      padding: { top: 0, bottom: 0, left: 0, right: 0 },
      margin: { top: 1, bottom: 0 },
      borderStyle: "single",
      borderColor: "magenta",
      title: chalk.bold("Active workflows"),
      titleAlignment: "left",
    });
  }
}
