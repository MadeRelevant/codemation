"use client";

import type { UserAccountDto,UserAccountStatus } from "@codemation/frontend-src/application/contracts/UserDirectoryContracts";
import { useCallback,useEffect,useState,type FormEvent,type MouseEvent } from "react";
import { CodemationDataTable } from "../components/CodemationDataTable";
import { CodemationFormattedDateTime } from "../components/CodemationFormattedDateTime";
import {
useInviteUserMutation,
useRegenerateUserInviteMutation,
useUpdateUserAccountStatusMutation,
useUserAccountsQuery,
} from "../realtime/realtime";

function UserStatusBadge({ userId, status }: { userId: string; status: UserAccountStatus }) {
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
                <UserStatusBadge userId={user.id} status={user.status} />
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

type UsersInviteDialogProps = Readonly<{
  email: string;
  setEmail: (v: string) => void;
  errorMessage: string | null;
  successUrl: string | null;
  isSubmitting: boolean;
  copyFeedback: boolean;
  onSubmit: () => void;
  onCopy: () => void;
  onClose: () => void;
}>;

function UsersInviteDialog({
  email,
  setEmail,
  errorMessage,
  successUrl,
  isSubmitting,
  copyFeedback,
  onSubmit,
  onCopy,
  onClose,
}: UsersInviteDialogProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const backdrop = (e: MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  const inviteFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit();
  };

  return (
    <div
      className="credential-dialog-overlay users-dialog-overlay"
      onClick={backdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby="users-invite-title"
      data-testid="users-invite-dialog"
    >
      <div className="credential-dialog users-dialog">
        <div className="credential-dialog__header">
          <h2 id="users-invite-title" className="credential-dialog__title">
            Invite user
          </h2>
        </div>
        {successUrl ? (
          <>
            <div className="credential-dialog__body">
              <p className="credential-dialog__help" data-testid="users-invite-success-message">
                Share this link; it expires in seven days.
              </p>
              <input
                type="text"
                readOnly
                className="credential-dialog__input"
                value={successUrl}
                data-testid="users-invite-link-field"
              />
              <div className="users-dialog__row">
                <button
                  type="button"
                  className="credential-dialog__btn credential-dialog__btn--secondary"
                  data-testid="users-invite-copy-link"
                  onClick={onCopy}
                >
                  {copyFeedback ? "Copied" : "Copy link"}
                </button>
              </div>
            </div>
            <div className="credential-dialog__footer">
              <button
                type="button"
                className="credential-dialog__btn credential-dialog__btn--secondary"
                data-testid="users-invite-cancel"
                onClick={onClose}
              >
                Done
              </button>
            </div>
          </>
        ) : (
          <form data-testid="users-invite-form" onSubmit={inviteFormSubmit}>
            <div className="credential-dialog__body">
              <label className="credential-dialog__field">
                <span className="credential-dialog__label">Email</span>
                <input
                  type="email"
                  className="credential-dialog__input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  data-testid="users-invite-email-input"
                  placeholder="colleague@company.com"
                  autoComplete="off"
                />
              </label>
              {errorMessage && (
                <div className="credential-dialog__error" data-testid="users-invite-error">
                  {errorMessage}
                </div>
              )}
            </div>
            <div className="credential-dialog__footer">
              <button
                type="button"
                className="credential-dialog__btn credential-dialog__btn--secondary"
                data-testid="users-invite-cancel"
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="credential-dialog__btn credential-dialog__btn--primary"
                data-testid="users-invite-submit"
                disabled={isSubmitting || !email.trim().includes("@")}
              >
                {isSubmitting ? "Sending…" : "Create invite"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

type UsersRegenerateDialogProps = Readonly<{
  email: string;
  newUrl: string | null;
  errorMessage: string | null;
  isSubmitting: boolean;
  copyFeedback: boolean;
  onConfirm: () => void;
  onCopy: () => void;
  onClose: () => void;
}>;

function UsersRegenerateDialog({
  email,
  newUrl,
  errorMessage,
  isSubmitting,
  copyFeedback,
  onConfirm,
  onCopy,
  onClose,
}: UsersRegenerateDialogProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const backdrop = (e: MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="credential-dialog-overlay users-dialog-overlay"
      onClick={backdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby="users-regenerate-title"
      data-testid="users-regenerate-dialog"
    >
      <div className="credential-dialog users-dialog">
        <div className="credential-dialog__header">
          <h2 id="users-regenerate-title" className="credential-dialog__title">
            Regenerate invite link
          </h2>
        </div>
        <div className="credential-dialog__body">
          {newUrl ? (
            <>
              <p className="credential-dialog__help" data-testid="users-regenerate-success-message">
                New link for {email}. Previous links stop working.
              </p>
              <input type="text" readOnly className="credential-dialog__input" value={newUrl} data-testid="users-regenerate-link-field" />
              <div className="users-dialog__row">
                <button
                  type="button"
                  className="credential-dialog__btn credential-dialog__btn--secondary"
                  data-testid="users-regenerate-copy-link"
                  onClick={onCopy}
                >
                  {copyFeedback ? "Copied" : "Copy link"}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="credential-dialog__help" data-testid="users-regenerate-confirm-text">
                Generate a new seven-day link for <strong data-testid="users-regenerate-email">{email}</strong>? The current invite link will no longer work.
              </p>
              {errorMessage && (
                <div className="credential-dialog__error" data-testid="users-regenerate-error">
                  {errorMessage}
                </div>
              )}
            </>
          )}
        </div>
        <div className="credential-dialog__footer">
          <button
            type="button"
            className="credential-dialog__btn credential-dialog__btn--secondary"
            data-testid="users-regenerate-cancel"
            onClick={onClose}
          >
            {newUrl ? "Close" : "Cancel"}
          </button>
          {!newUrl && (
            <button
              type="button"
              className="credential-dialog__btn credential-dialog__btn--primary"
              data-testid="users-regenerate-confirm"
              disabled={isSubmitting}
              onClick={onConfirm}
            >
              {isSubmitting ? "Working…" : "Regenerate"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
