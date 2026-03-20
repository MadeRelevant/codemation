import type { AgentCanvasPresentation,ToolConfig } from "@codemation/core";


import type { CanvasIconName } from "@codemation/core-nodes";



import { ClassifyMailTool } from "./classifyMailTool";



export class ClassifyMailToolConfig implements ToolConfig {
  readonly type = ClassifyMailTool;

  constructor(
    public readonly name: string,
    public readonly keywords: ReadonlyArray<string>,
    public readonly description = "Classify an email as RFQ (request for quotation) or not.",
    public readonly presentation?: AgentCanvasPresentation<CanvasIconName>,
  ) {}
}
