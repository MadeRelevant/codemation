import path from "node:path";

import { WorkflowModulePathFinder } from "./WorkflowModulePathFinder";

export class WorkflowDiscoveryPathSegmentsComputer {
  compute(args: Readonly<{
    consumerRoot: string;
    workflowDiscoveryDirectories: ReadonlyArray<string>;
    absoluteWorkflowModulePath: string;
  }>): readonly string[] | undefined {
    const normalizedConsumer = path.resolve(args.consumerRoot);
    const normalizedWorkflowPath = path.resolve(args.absoluteWorkflowModulePath);
    const directories =
      args.workflowDiscoveryDirectories.length > 0
        ? args.workflowDiscoveryDirectories
        : [...WorkflowModulePathFinder.defaultWorkflowDirectories];

    let bestRoot: string | null = null;
    for (const directory of directories) {
      const absoluteDirectory = path.resolve(normalizedConsumer, directory);
      const isPrefix =
        normalizedWorkflowPath === absoluteDirectory || normalizedWorkflowPath.startsWith(`${absoluteDirectory}${path.sep}`);
      if (!isPrefix) {
        continue;
      }
      if (!bestRoot || absoluteDirectory.length > bestRoot.length) {
        bestRoot = absoluteDirectory;
      }
    }
    if (!bestRoot) {
      return undefined;
    }
    const relative = path.relative(bestRoot, normalizedWorkflowPath);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      return undefined;
    }
    if (relative.length === 0) {
      return undefined;
    }
    const parts = relative.split(path.sep).filter((segment) => segment.length > 0);
    if (parts.length === 0) {
      return undefined;
    }
    const lastIndex = parts.length - 1;
    const last = parts[lastIndex] ?? "";
    const ext = path.extname(last);
    parts[lastIndex] = ext ? last.slice(0, -ext.length) : last;
    return parts;
  }
}
