"use client";

import { Button } from "@/components/ui/button";
import { CodemationDialog } from "@/components/CodemationDialog";
import { Input } from "@/components/ui/input";
import { InviteLinkCopyRow } from "./InviteLinkCopyRow";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  useForm,
  zodResolver,
} from "@/components/forms";
import { usersInviteFormSchema, type UsersInviteFormValues } from "../schemas/usersInviteFormSchema";

type UsersInviteDialogProps = Readonly<{
  errorMessage: string | null;
  successUrl: string | null;
  isSubmitting: boolean;
  copyFeedback: boolean;
  onSubmit: (email: string) => void | Promise<void>;
  onCopy: () => void;
  onClose: () => void;
}>;

export function UsersInviteDialog({
  errorMessage,
  successUrl,
  isSubmitting,
  copyFeedback,
  onSubmit,
  onCopy,
  onClose,
}: UsersInviteDialogProps) {
  const form = useForm<UsersInviteFormValues>({
    resolver: zodResolver(usersInviteFormSchema),
    defaultValues: { email: "" },
  });

  return (
    <CodemationDialog
      onClose={onClose}
      testId="users-invite-dialog"
      size="narrow"
      contentClassName="max-h-[min(90vh,640px)]"
    >
      <CodemationDialog.Title>Invite user</CodemationDialog.Title>
      {successUrl ? (
        <>
          <CodemationDialog.Content className="space-y-3">
            <p className="m-0 text-muted-foreground" data-testid="users-invite-success-message">
              Share this link; it expires in seven days.
            </p>
            <InviteLinkCopyRow
              url={successUrl}
              copyFeedback={copyFeedback}
              onCopy={onCopy}
              linkTestId="users-invite-link-field"
              copyTestId="users-invite-copy-link"
            />
          </CodemationDialog.Content>
          <CodemationDialog.Actions>
            <Button type="button" variant="outline" data-testid="users-invite-cancel" onClick={onClose}>
              Done
            </Button>
          </CodemationDialog.Actions>
        </>
      ) : (
        <Form {...form}>
          <form
            data-testid="users-invite-form"
            onSubmit={form.handleSubmit((values) => void onSubmit(values.email))}
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            <CodemationDialog.Content className="space-y-3">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        data-testid="users-invite-email-input"
                        placeholder="colleague@company.com"
                        autoComplete="off"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {errorMessage ? (
                <div className="text-sm text-destructive" data-testid="users-invite-error" role="alert">
                  {errorMessage}
                </div>
              ) : null}
            </CodemationDialog.Content>
            <CodemationDialog.Actions>
              <Button type="button" variant="outline" data-testid="users-invite-cancel" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" data-testid="users-invite-submit" disabled={isSubmitting}>
                {isSubmitting ? "Sending…" : "Create invite"}
              </Button>
            </CodemationDialog.Actions>
          </form>
        </Form>
      )}
    </CodemationDialog>
  );
}
