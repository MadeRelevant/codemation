import type { VerifyUserInviteResponseDto } from "../contracts/userDirectoryContracts.types";

import { Query } from "../bus/Query";

export class VerifyUserInviteQuery extends Query<VerifyUserInviteResponseDto> {
  constructor(public readonly token: string) {
    super();
  }
}
