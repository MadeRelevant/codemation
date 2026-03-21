"use client";

import type { UserAccountDto, UserAccountStatus } from "@codemation/host-src/application/contracts/userDirectoryContracts.types";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { CodemationDataTable } from "../../../components/CodemationDataTable";
import { CodemationFormattedDateTime } from "../../../components/CodemationFormattedDateTime";
import {
useInviteUserMutation,
useRegenerateUserInviteMutation,
useUpdateUserAccountStatusMutation,
useUserAccountsQuery,
} from "../../workflows/hooks/realtime/realtime";
import { UsersInviteDialog } from "../components/UsersInviteDialog";
import { UsersRegenerateDialog } from "../components/UsersRegenerateDialog";
import { UsersScreenUserStatusBadge } from "../components/UsersScreenUserStatusBadge";

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
    <div data-testid="users-screen" className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <p className="m-0 max-w-2xl text-sm text-muted-foreground">
          Invite teammates with a secure link. Invites expire after seven days; you can regenerate a link for any invited account.
        </p>
        <Button type="button" onClick={openInvite} data-testid="users-invite-open">
          Invite user
        </Button>
      </div>

      {loadError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert" data-testid="users-load-error">
          Failed to load users.
        </div>
      )}

      {loading ? (
        <div className="text-sm text-muted-foreground" data-testid="users-loading">
          Loading…
        </div>
      ) : users.length === 0 ? (
        <div
          className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground"
          data-testid="users-empty"
        >
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
            <TableRow key={user.id} data-testid={`user-row-${user.id}`}>
              <TableCell>
                <span data-testid={`user-email-${user.id}`}>{user.email}</span>
              </TableCell>
              <TableCell>
                <span data-testid={`user-login-methods-${user.id}`}>
                  {loginMethods.length > 0 ? loginMethods.join(", ") : "—"}
                </span>
              </TableCell>
              <TableCell>
                <UsersScreenUserStatusBadge userId={user.id} status={user.status} />
              </TableCell>
              <TableCell>
                <CodemationFormattedDateTime
                  isoUtc={user.inviteExpiresAt}
                  dataTestId={`user-invite-expires-${user.id}`}
                />
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap items-center gap-2">
                  {user.status === "invited" && (
                    <Button
                      type="button"
                      size="sm"
                      data-testid={`user-regenerate-invite-${user.id}`}
                      onClick={() => {
                        setInviteError(null);
                        setRegeneratedUrl(null);
                        setRegenerateDialog(user);
                      }}
                      disabled={regenerateMutation.isPending}
                    >
                      Regenerate link
                    </Button>
                  )}
                  {user.status !== "invited" && (
                    <label className="inline-flex items-center gap-2">
                      <span className="sr-only" data-testid={`user-status-label-${user.id}`}>
                        Account status
                      </span>
                      <select
                        className="h-8 rounded-md border border-input bg-background px-2 text-sm shadow-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
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
              </TableCell>
            </TableRow>
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
