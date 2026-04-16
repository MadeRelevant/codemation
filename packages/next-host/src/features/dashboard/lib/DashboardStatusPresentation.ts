import type { TelemetryDashboardRunOriginDto } from "@codemation/host-src/application/contracts/TelemetryDashboardContracts";

export class DashboardStatusPresentation {
  static readonly completedColor = "#16a34a";
  static readonly failedColor = "#dc2626";
  static readonly runningColor = "#2563eb";

  static colorForStatus(status: "completed" | "failed" | "running"): string {
    if (status === "completed") {
      return this.completedColor;
    }
    if (status === "failed") {
      return this.failedColor;
    }
    return this.runningColor;
  }

  static labelForStatus(status: "completed" | "failed" | "running"): string {
    if (status === "completed") {
      return "Completed";
    }
    if (status === "failed") {
      return "Failed";
    }
    return "Running";
  }

  static labelForOrigin(origin: TelemetryDashboardRunOriginDto): string {
    return origin === "manual" ? "Manual" : "Triggered";
  }
}
