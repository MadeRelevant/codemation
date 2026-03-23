import { Query } from "../bus/Query";

export type CredentialFieldEnvStatusDto = Readonly<Record<string, boolean>>;

export class GetCredentialFieldEnvStatusQuery extends Query<CredentialFieldEnvStatusDto> {}
