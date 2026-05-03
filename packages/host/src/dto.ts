/**
 * DTOs and contract types for UI consumption.
 * Re-exports types from application contracts without pulling in infrastructure dependencies.
 */

export type {
  CredentialInstanceDto,
  CredentialOAuth2ConnectionDto,
  CredentialInstanceWithSecretsDto,
  WorkflowCredentialHealthSlotDto,
  WorkflowCredentialHealthDto,
  CreateCredentialInstanceRequest,
  UpdateCredentialInstanceRequest,
  UpsertCredentialBindingRequest,
} from "./application/contracts/CredentialContractsRegistry";

export type {
  TelemetryDashboardBucketIntervalDto,
  TelemetryDashboardRunOriginDto,
  TelemetryDashboardFiltersDto,
  TelemetryDashboardRunAggregateDto,
  TelemetryDashboardAiAggregateDto,
  TelemetryDashboardCostKeyTotalDto,
  TelemetryDashboardCostCurrencyTotalDto,
  TelemetryDashboardCostAggregateDto,
  TelemetryDashboardSummaryDto,
  TelemetryDashboardBucketCostDto,
  TelemetryDashboardTimeseriesBucketDto,
  TelemetryDashboardTimeseriesDto,
  TelemetryDashboardDimensionsDto,
  TelemetryDashboardTimeseriesRequestDto,
  TelemetryDashboardRunsRequestDto,
  TelemetryDashboardRunListItemDto,
  TelemetryDashboardRunsDto,
} from "./application/contracts/TelemetryDashboardContracts";

export type {
  StartTestSuiteRunRequest,
  StartTestSuiteRunResponse,
  TestSuiteChildRunDto,
  TestSuiteRunSummaryDto,
  TestSuiteRunDetailDto,
  TestAssertionDto,
} from "./application/contracts/TestingContracts";

export type {
  WorkflowNodeDto,
  WorkflowEdgeDto,
  WorkflowDto,
  WorkflowSummary,
} from "./application/contracts/WorkflowViewContracts";

export type {
  UserAccountStatus,
  UserAccountDto,
  UserAccountDtoInput,
  InviteUserResponseDto,
  VerifyUserInviteResponseDto,
  InviteUserRequestDto,
  AcceptUserInviteRequestDto,
  UpdateUserAccountStatusRequestDto,
  UpsertLocalBootstrapUserResultDto,
} from "./application/contracts/userDirectoryContracts.types";

export {
  withUserAccountLoginMethodsDefaults,
  withInviteUserResponseLoginMethodsDefaults,
} from "./application/contracts/userDirectoryContracts.types";
