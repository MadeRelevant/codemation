export type EcmaScriptBuildTarget = "es2020" | "es2022";

/**
 * Options for `codemation build` / programmatic {@link ConsumerOutputBuilder} output.
 * Mirrors common production-build toggles (source maps, emit target) similar in spirit to Next.js build tuning.
 */
export type ConsumerBuildOptions = Readonly<{
  /** When true, emit `.js.map` (and inline sources in maps) for transpiled workflow modules. */
  sourceMaps: boolean;
  /** ECMAScript language version for emitted workflow JavaScript. */
  target: EcmaScriptBuildTarget;
}>;
