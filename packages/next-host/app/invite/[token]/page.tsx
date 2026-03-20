import { HostedInviteAcceptPage } from "../../../src/ui/HostedInviteAcceptPage";

export default async function InviteTokenPage(args: Readonly<{ params: Promise<{ token: string }> }>) {
  const params = await args.params;
  return (
    <div className="invite-accept-layout">
      <HostedInviteAcceptPage inviteToken={params.token} />
    </div>
  );
}
