export class CliAsciiTableBuilder {
  static build(headers: ReadonlyArray<string>, rows: ReadonlyArray<ReadonlyArray<string>>): string {
    const columnCount = headers.length;
    const widths: number[] = [];
    for (let i = 0; i < columnCount; i += 1) {
      const headerWidth = headers[i]?.length ?? 0;
      const cellWidths = rows.map((row) => row[i]?.length ?? 0);
      widths.push(Math.max(headerWidth, ...cellWidths, 3));
    }
    const padCell = (text: string, index: number): string => text.padEnd(widths[index] ?? text.length);
    const horizontal = `+${widths.map((w) => "-".repeat(w + 2)).join("+")}+`;
    const formatRow = (cells: ReadonlyArray<string>): string =>
      `| ${cells.map((cell, index) => padCell(cell, index)).join(" | ")} |`;
    return [horizontal, formatRow(headers), horizontal, ...rows.map(formatRow), horizontal].join("\n");
  }
}
