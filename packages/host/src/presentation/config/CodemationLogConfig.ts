/**
 * Minimum level for namespaces matched by {@link CodemationLogRule.filter}.
 * `silent` suppresses all log lines for matching namespaces.
 */
export type CodemationLogLevelName = "debug" | "info" | "warn" | "error" | "silent";

/**
 * One rule: {@link filter} is one glob or several (`*` = any substring; a lone `*` matches all namespaces).
 * If multiple patterns are given, **any** match applies this rule’s level.
 * Rules are evaluated in order; the **first** rule whose filter set matches wins.
 */
export type CodemationLogRule = Readonly<{
  filter: string | ReadonlyArray<string>;
  level: CodemationLogLevelName;
}>;

/**
 * Either a single rule (`{ filter, level }`) or multiple `{ rules: [...] }`.
 * Put broader patterns last, e.g. `{ filter: "codemation.webhooks.*", level: "info" }` then `{ filter: "*", level: "warn" }`.
 * Use an array for `filter` to match several namespaces with the same level, e.g. `filter: ["codemation.webhooks.*", "codemation.engine.triggers"]`.
 */
export type CodemationLogConfig = Readonly<{ rules: ReadonlyArray<CodemationLogRule> }> | CodemationLogRule;
