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
}
