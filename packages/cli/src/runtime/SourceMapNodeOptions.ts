export class SourceMapNodeOptions {
  appendToNodeOptions(existingNodeOptions: string | undefined): string {
    const sourceMapOption = "--enable-source-maps";
    if (!existingNodeOptions || existingNodeOptions.trim().length === 0) {
      return sourceMapOption;
    }
    if (existingNodeOptions.includes(sourceMapOption)) {
      return existingNodeOptions;
    }
    return `${existingNodeOptions} ${sourceMapOption}`.trim();
  }
}
