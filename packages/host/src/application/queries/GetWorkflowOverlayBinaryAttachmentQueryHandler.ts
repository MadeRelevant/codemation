import type { BinaryAttachment } from "@codemation/core";
import { inject } from "@codemation/core";
import { RunBinaryAttachmentLookupService } from "../binary/RunBinaryAttachmentLookupService";
import { QueryHandler } from "../bus/QueryHandler";
import { HandlesQuery } from "../../infrastructure/di/HandlesQueryRegistry";
import { GetWorkflowOverlayBinaryAttachmentQuery } from "./GetWorkflowOverlayBinaryAttachmentQuery";

@HandlesQuery.for(GetWorkflowOverlayBinaryAttachmentQuery)
export class GetWorkflowOverlayBinaryAttachmentQueryHandler extends QueryHandler<
  GetWorkflowOverlayBinaryAttachmentQuery,
  BinaryAttachment | undefined
> {
  constructor(
    @inject(RunBinaryAttachmentLookupService)
    private readonly lookupService: RunBinaryAttachmentLookupService,
  ) {
    super();
  }

  async execute(query: GetWorkflowOverlayBinaryAttachmentQuery): Promise<BinaryAttachment | undefined> {
    return this.lookupService.findForWorkflowOverlay(query.workflowId, query.binaryId);
  }
}
