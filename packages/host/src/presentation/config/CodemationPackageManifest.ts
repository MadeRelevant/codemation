export interface CodemationPluginPackageManifest {
  readonly kind: "plugin";
  readonly entry: string;
  readonly exportName?: string;
}

export interface CodemationPackageManifest {
  readonly plugin?: CodemationPluginPackageManifest;
}
