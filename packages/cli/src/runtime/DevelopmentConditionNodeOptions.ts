export class DevelopmentConditionNodeOptions {
  appendToNodeOptions(existingNodeOptions: string | undefined): string {
    const developmentCondition = "--conditions=development";
    if (!existingNodeOptions || existingNodeOptions.trim().length === 0) {
      return developmentCondition;
    }
    if (existingNodeOptions.includes(developmentCondition)) {
      return existingNodeOptions;
    }
    return `${existingNodeOptions} ${developmentCondition}`.trim();
  }

  /**
   * Removes `--conditions=development` from a NODE_OPTIONS string, leaving any
   * other options intact. Used when spawning a child process (e.g. Next.js) that
   * must NOT see the `development` package.json exports condition — otherwise
   * `@codemation/core` resolves to its TypeScript source under Node's resolver,
   * which fails to add the `.ts` extension and reports `Cannot find module
   * .../contracts/Clock` at runtime.
   */
  removeFromNodeOptions(existingNodeOptions: string | undefined): string {
    if (!existingNodeOptions) return "";
    return existingNodeOptions
      .replace(/(^|\s)--conditions=development(?=\s|$)/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
}
