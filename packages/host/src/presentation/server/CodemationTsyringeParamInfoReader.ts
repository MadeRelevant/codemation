export class CodemationTsyringeParamInfoReader {
  private static readonly injectionTokenMetadataKey = "injectionTokens";
  private static readonly designParamTypesMetadataKey = "design:paramtypes";

  static read(target: object): ReadonlyArray<unknown> {
    const designParamTypes = this.readDesignParamTypes(target);
    const injectionTokens = this.readInjectionTokens(target);
    Object.keys(injectionTokens).forEach((key: string) => {
      designParamTypes[Number(key)] = injectionTokens[key];
    });
    return designParamTypes;
  }

  private static readDesignParamTypes(target: object): unknown[] {
    const reflected = Reflect.getMetadata?.(this.designParamTypesMetadataKey, target);
    return Array.isArray(reflected) ? [...reflected] : [];
  }

  private static readInjectionTokens(target: object): Record<string, unknown> {
    const reflected = Reflect.getOwnMetadata?.(this.injectionTokenMetadataKey, target);
    if (!reflected || typeof reflected !== "object") {
      return {};
    }
    return reflected as Record<string, unknown>;
  }
}
