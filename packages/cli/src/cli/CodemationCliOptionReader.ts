export class CodemationCliOptionReader {
  constructor(private readonly options: ReadonlyMap<string, string | true>) {}

  getString(...names: ReadonlyArray<string>): string | undefined {
    for (const name of names) {
      const value = this.options.get(name);
      if (typeof value === "string" && value.length > 0) return value;
    }
    return undefined;
  }

  has(name: string): boolean {
    return this.options.has(name);
  }
}
