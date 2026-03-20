"use client";

import { CodemationDataTable } from "../components/CodemationDataTable";
import type { CredentialInstanceDto } from "../realtime/realtime";
import { CredentialsScreenHealthBadge } from "./CredentialsScreenHealthBadge";

export type CredentialsScreenInstancesTableProps = {
  credentialInstances: ReadonlyArray<CredentialInstanceDto>;
  testResult: { instanceId: string; status: string; message?: string } | null;
  activeTestInstanceId: string | null;
  onOpenEdit: (instance: CredentialInstanceDto) => void;
  onTest: (instance: CredentialInstanceDto) => Promise<void>;
  onOpenDelete: (instance: CredentialInstanceDto) => void;
};

export function CredentialsScreenInstancesTable({
  credentialInstances,
  testResult,
  activeTestInstanceId,
  onOpenEdit,
  onTest,
  onOpenDelete,
}: CredentialsScreenInstancesTableProps) {
  return (
    <CodemationDataTable
      tableTestId="credentials-table"
      columns={[
        { key: "name", header: "Name" },
        { key: "type", header: "Type" },
        { key: "source", header: "Source" },
        { key: "status", header: "Status" },
        { key: "health", header: "Health" },
        { key: "actions", header: "Actions" },
      ]}
    >
      {credentialInstances.map((instance) => (
        <tr key={instance.instanceId} data-testid={`credential-instance-row-${instance.instanceId}`}>
          <td>
            <button
              type="button"
              className="credentials-table__name-btn"
              onClick={() => onOpenEdit(instance)}
              data-testid={`credential-instance-name-${instance.instanceId}`}
            >
              {instance.displayName}
            </button>
          </td>
          <td>
            <span className="credentials-table__type">{instance.typeId}</span>
          </td>
          <td>
            <span className="credentials-table__badge credentials-table__badge--unknown">{instance.sourceKind}</span>
          </td>
          <td>
            <span className="credentials-table__badge credentials-table__badge--unknown">{instance.setupStatus}</span>
          </td>
          <td>
            <CredentialsScreenHealthBadge status={instance.latestHealth?.status ?? "unknown"} />
          </td>
          <td>
            <div className="credentials-table__actions">
              {testResult?.instanceId === instance.instanceId && (
                <span
                  className={`credentials-table__test-result credentials-table__test-result--${testResult.status}`}
                  data-testid={`credential-test-result-${instance.instanceId}`}
                >
                  {testResult.status === "healthy" ? "Healthy" : "Failing"}
                </span>
              )}
              <button
                type="button"
                className="credentials-table__btn credentials-table__btn--primary"
                data-testid={`credential-instance-test-button-${instance.instanceId}`}
                onClick={() => void onTest(instance)}
                disabled={activeTestInstanceId === instance.instanceId}
              >
                {activeTestInstanceId === instance.instanceId ? "Testing…" : "Test"}
              </button>
              <button
                type="button"
                className="credentials-table__btn credentials-table__btn--danger"
                data-testid={`credential-instance-delete-button-${instance.instanceId}`}
                onClick={() => onOpenDelete(instance)}
              >
                Delete
              </button>
            </div>
          </td>
        </tr>
      ))}
    </CodemationDataTable>
  );
}
