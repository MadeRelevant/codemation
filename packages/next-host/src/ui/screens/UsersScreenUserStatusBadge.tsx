import type { UserAccountStatus } from "@codemation/frontend-src/application/contracts/userDirectoryContracts.types";

export function UsersScreenUserStatusBadge(props: Readonly<{ userId: string; status: UserAccountStatus }>) {
  const { status, userId } = props;
  const variant =
    status === "active" ? "user-active" : status === "invited" ? "user-invited" : "user-inactive";
  return (
    <span
      className={`credentials-table__badge credentials-table__badge--${variant}`}
      data-testid={`user-status-badge-${userId}`}
    >
      {status}
    </span>
  );
}
