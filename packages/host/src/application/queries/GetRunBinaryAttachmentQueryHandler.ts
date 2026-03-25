import type { BinaryAttachment } from "@codemation/core";
import { inject } from "@codemation/core";
import { RunBinaryAttachmentLookupService } from "../binary/RunBinaryAttachmentLookupService";
import { QueryHandler } from "../bus/QueryHandler";
import { HandlesQuery } from "../../infrastructure/di/HandlesQueryRegistry";
import { GetRunBinaryAttachmentQuery } from "./GetRunBinaryAttachmentQuery";

@HandlesQuery.for(GetRunBinaryAttachmentQuery)
export class GetRunBinaryAttachmentQueryHandler extends QueryHandler<
  GetRunBinaryAttachmentQuery,
  BinaryAttachment | undefined
> {
  constructor(
    @inject(RunBinaryAttachmentLookupService)
    private readonly lookupService: RunBinaryAttachmentLookupService,
  ) {
    super();
  }

  async execute(query: GetRunBinaryAttachmentQuery): Promise<BinaryAttachment | undefined> {
    return this.lookupService.findForRun(query.runId, query.binaryId);
  }
}
