"use client";

import type { UserAccountDto,UserAccountStatus } from "@codemation/frontend-src/application/contracts/userDirectoryContracts.types";
import { useCallback,useEffect,useState } from "react";
import { CodemationDataTable } from "../components/CodemationDataTable";
import { CodemationFormattedDateTime } from "../components/CodemationFormattedDateTime";
import {
useInviteUserMutation,
useRegenerateUserInviteMutation,
useUpdateUserAccountStatusMutation,
useUserAccountsQuery,
} from "../realtime/realtime";
import { UsersInviteDialog } from "./UsersInviteDialog";
import { UsersRegenerateDialog } from "./UsersRegenerateDialog";
import { UsersScreenUserStatusBadge } from "./UsersScreenUserStatusBadge";

export function UsersScreen() {
  const usersQuery = useUserAccountsQuery();
  const inviteMutation = useInviteUserMutation();
  const regenerateMutation = useRegenerateUserInviteMutation();
  const statusMutation = useUpdateUserAccountStatusMutation();
  const users = usersQuery.data ?? [];

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccessUrl, setInviteSuccessUrl] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState(false);

  const [regenerateDialog, setRegenerateDialog] = useState<UserAccountDto | null>(null);
  const [regeneratedUrl, setRegeneratedUrl] = useState<string | null>(null);

  const closeInvite = useCallback(() => {
    setInviteOpen(false);
    setInviteEmail("");
    setInviteError(null);
    setInviteSuccessUrl(null);
    setCopyFeedback(false);
  }, []);

  const openInvite = useCallback(() => {
    setInviteOpen(true);
    setInviteEmail("");
    setInviteError(null);
    setInviteSuccessUrl(null);
    setCopyFeedback(false);
  }, []);

  useEffect(() => {
    if (!copyFeedback) return;
    const t = window.setTimeout(() => setCopyFeedback(false), 2000);
    return () => window.clearTimeout(t);
  }, [copyFeedback]);

  const submitInvite = async (): Promise<void> => {
    setInviteError(null);
    try {
      const result = await inviteMutation.mutateAsync(inviteEmail.trim());
      setInviteSuccessUrl(result.inviteUrl);
    } catch (e) {
      setInviteError(e instanceof Error ? e.message : String(e));
    }
  };

  const copyInviteUrl = async (url: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(url);
      setCopyFeedback(true);
    } catch {
      setInviteError("Could not copy to clipboard.");
    }
  };

  const runRegenerate = async (user: UserAccountDto): Promise<void> => {
    setInviteError(null);
    try {
      const result = await regenerateMutation.mutateAsync(user.id);
      setRegeneratedUrl(result.inviteUrl);
    } catch (e) {
      setInviteError(e instanceof Error ? e.message : String(e));
    }
  };

  const onStatusChange = async (user: UserAccountDto, status: UserAccountStatus): Promise<void> => {
    if (status === "invited" || user.status === status) return;
    try {
      await statusMutation.mutateAsync({ userId: user.id, status });
    } catch {
      /* query error surfaces via mutation state if needed */
    }
  };

  const loading = usersQuery.isLoading;
  const loadError = usersQuery.isError;

  return (
    <div data-testid="users-screen" className="users-screen">
      <div className="users-screen__header">
        <p className="users-screen__description">
          Invite teammates with a secure link. Invites expire after seven days; you can regenerate a link for any invited account.
        </p>
        <button type="button" className="users-screen__primary-btn" onClick={openInvite} data-testid="users-invite-open">
          Invite user
        </button>
      </div>

      {loadError && (
        <div className="users-screen__alert" role="alert" data-testid="users-load-error">
          Failed to load users.
        </div>
      )}

      {loading ? (
        <div className="users-screen__loading" data-testid="users-loading">
          Loading…
        </div>
      ) : users.length === 0 ? (
        <div className="users-screen__empty" data-testid="users-empty">
          No users yet. Invite someone to get started.
        </div>
      ) : (
        <CodemationDataTable
          tableTestId="users-table"
          columns={[
            { key: "email", header: "Email" },
            { key: "loginMethods", header: "Sign-in methods" },
            { key: "status", header: "Status" },
            { key: "inviteExpiry", header: "Invite expires" },
            { key: "actions", header: "Actions" },
          ]}
        >
          {users.map((user) => {
            const loginMethods = user.loginMethods ?? [];
            return (
            <tr key={user.id} data-testid={`user-row-${user.id}`}>
              <td>
                <span data-testid={`user-email-${user.id}`}>{user.email}</span>
              </td>
              <td>
                <span data-testid={`user-login-methods-${user.id}`}>
                  {loginMethods.length > 0 ? loginMethods.join(", ") : "—"}
                </span>
              </td>
              <td>
                <UsersScreenUserStatusBadge userId={user.id} status={user.status} />
              </td>
              <td>
                <CodemationFormattedDateTime
                  isoUtc={user.inviteExpiresAt}
                  dataTestId={`user-invite-expires-${user.id}`}
                />
              </td>
              <td>
                <div className="credentials-table__actions">
                  {user.status === "invited" && (
                    <button
                      type="button"
                      className="credentials-table__btn credentials-table__btn--primary"
                      data-testid={`user-regenerate-invite-${user.id}`}
                      onClick={() => {
                        setInviteError(null);
                        setRegeneratedUrl(null);
                        setRegenerateDialog(user);
                      }}
                      disabled={regenerateMutation.isPending}
                    >
                      Regenerate link
                    </button>
                  )}
                  {user.status !== "invited" && (
                    <label className="users-screen__status-edit">
                      <span className="visually-hidden" data-testid={`user-status-label-${user.id}`}>
                        Account status
                      </span>
                      <select
                        className="users-screen__status-select"
                        value={user.status}
                        onChange={(e) => void onStatusChange(user, e.target.value as UserAccountStatus)}
                        data-testid={`user-account-status-${user.id}`}
                        disabled={statusMutation.isPending}
                      >
                        <option value="active">active</option>
                        <option value="inactive">inactive</option>
                      </select>
                    </label>
                  )}
                </div>
              </td>
            </tr>
            );
          })}
        </CodemationDataTable>
      )}

      {inviteOpen && (
        <UsersInviteDialog
          email={inviteEmail}
          setEmail={setInviteEmail}
          errorMessage={inviteError}
          successUrl={inviteSuccessUrl}
          isSubmitting={inviteMutation.isPending}
          copyFeedback={copyFeedback}
          onSubmit={() => void submitInvite()}
          onCopy={() => inviteSuccessUrl && void copyInviteUrl(inviteSuccessUrl)}
          onClose={closeInvite}
        />
      )}

      {regenerateDialog && (
        <UsersRegenerateDialog
          email={regenerateDialog.email}
          newUrl={regeneratedUrl}
          errorMessage={inviteError}
          isSubmitting={regenerateMutation.isPending}
          copyFeedback={copyFeedback}
          onConfirm={() => void runRegenerate(regenerateDialog)}
          onCopy={() => regeneratedUrl && void copyInviteUrl(regeneratedUrl)}
          onClose={() => {
            setRegenerateDialog(null);
            setRegeneratedUrl(null);
            setInviteError(null);
          }}
        />
      )}
    </div>
  );
}
